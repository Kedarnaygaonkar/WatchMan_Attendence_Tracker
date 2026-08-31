/**
 * Societies Page — CRUD management with interactive Leaflet map.
 * Agency admin can add, edit, search, and set geofence on a map.
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MapContainer, TileLayer, Marker, useMapEvents, Circle } from 'react-leaflet';
import L from 'leaflet';
import {
  Plus, Search, Edit2, Building2, MapPin, Phone, Users,
  Map, X
} from 'lucide-react';
import api from '../../api/client';
import toast from 'react-hot-toast';
import 'leaflet/dist/leaflet.css';
import { useAuthStore } from '../../stores/authStore';

// Fix leaflet marker icon
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

interface Society {
  id: string;
  name: string;
  address: string;
  contact_person: string;
  contact_phone: string;
  latitude: number;
  longitude: number;
  geofence_radius: number;
  required_guards: number;
  is_active: boolean;
  active_assignments: number;
  agency_id?: string;
}

const defaultForm = {
  name: '', address: '', contactPerson: '', contactPhone: '',
  latitude: 18.5204, longitude: 73.8567, geofenceRadius: 100, requiredGuards: 1, isActive: true, notes: '',
  agencyId: '',
};

function MapClickHandler({ onLocationSelect }: { onLocationSelect: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onLocationSelect(e.latlng.lat, e.latlng.lng) });
  return null;
}

export default function SocietiesPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editSociety, setEditSociety] = useState<Society | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [mapCenter, setMapCenter] = useState<[number, number]>([18.5204, 73.8567]);
  const { user } = useAuthStore();

  const { data: agencies } = useQuery({
    queryKey: ['agencies'],
    queryFn: async () => {
      const { data } = await api.get('/agencies');
      return data.data;
    },
    enabled: user?.role === 'super_admin',
  });

  const { data, isLoading } = useQuery({
    queryKey: ['societies', search],
    queryFn: async () => {
      const { data } = await api.get('/societies', { params: { search: search || undefined } });
      return data.data as Society[];
    },
  });

  const mutation = useMutation({
    mutationFn: async (payload: typeof form) => {
      if (editSociety) {
        return api.put(`/societies/${editSociety.id}`, payload);
      }
      return api.post('/societies', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['societies'] });
      queryClient.invalidateQueries({ queryKey: ['societies-list'] });
      queryClient.invalidateQueries({ queryKey: ['soc-all'] });
      toast.success(editSociety ? 'Society updated!' : 'Society added!');
      closeModal();
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to save society';
      toast.error(msg);
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/societies/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['societies'] }); toast.success('Society deactivated'); },
  });

  function openAdd() {
    setForm(defaultForm);
    setEditSociety(null);
    setMapCenter([18.5204, 73.8567]);
    setShowModal(true);
  }

  function openEdit(s: Society) {
    setForm({
      name: s.name, address: s.address,
      contactPerson: s.contact_person || '', contactPhone: s.contact_phone || '',
      latitude: parseFloat(String(s.latitude)), longitude: parseFloat(String(s.longitude)),
      geofenceRadius: s.geofence_radius, requiredGuards: s.required_guards,
      isActive: s.is_active, notes: '', agencyId: s.agency_id || '',
    });
    setMapCenter([parseFloat(String(s.latitude)), parseFloat(String(s.longitude))]);
    setEditSociety(s);
    setShowModal(true);
  }

  function closeModal() { setShowModal(false); setEditSociety(null); }

  function handleMapSelect(lat: number, lng: number) {
    setForm(f => ({ ...f, latitude: lat, longitude: lng }));
    // Try to reverse geocode with Nominatim
    fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`)
      .then(r => r.json())
      .then(d => { if (d.display_name) setForm(f => ({ ...f, address: d.display_name })); })
      .catch(() => {});
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="section-header">
        <div>
          <h1 className="section-title">Societies</h1>
          <p className="text-slate-500 text-sm">{data?.length ?? 0} societies managed</p>
        </div>
        <button onClick={openAdd} className="btn-primary px-4 py-2.5 text-sm">
          <Plus className="w-4 h-4" /> Add Society
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" style={{width:'16px',height:'16px'}} />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search societies..." className="input pl-10 max-w-sm" />
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({length:3}).map((_,i) => <div key={i} className="card p-5 animate-pulse h-48" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {data?.map((s) => (
            <div key={s.id} className={`card p-5 space-y-3 hover:border-brand-500/30 transition-colors ${!s.is_active && 'opacity-60'}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-brand-500/20 flex items-center justify-center shrink-0">
                    <Building2 className="w-5 h-5 text-brand-400" />
                  </div>
                  <div>
                    <p className="font-bold text-slate-100">{s.name}</p>
                    <span className={`badge text-xs ${s.is_active ? 'badge-present' : 'badge-absent'}`}>
                      {s.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </div>
                <button onClick={() => openEdit(s)} className="p-2 rounded-lg hover:bg-surface-700 text-slate-500 hover:text-slate-300">
                  <Edit2 className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-1.5 text-sm">
                <div className="flex items-start gap-2 text-slate-400">
                  <MapPin className="w-4 h-4 mt-0.5 shrink-0" />
                  <span className="line-clamp-2">{s.address}</span>
                </div>
                {s.contact_person && (
                  <div className="flex items-center gap-2 text-slate-400">
                    <Phone className="w-4 h-4 shrink-0" />
                    <span>{s.contact_person} • {s.contact_phone}</span>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-surface-700 text-xs text-slate-500">
                <div className="flex items-center gap-1.5">
                  <Map className="w-3.5 h-3.5" />
                  <span>Radius: {s.geofence_radius}m</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" />
                  <span>{s.active_assignments}/{s.required_guards} guards</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="card w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-surface-700">
              <h2 className="font-bold text-slate-100">{editSociety ? 'Edit Society' : 'Add Society'}</h2>
              <button onClick={closeModal} className="p-1.5 rounded-lg hover:bg-surface-700 text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="form-group">
                  <label className="label">Society Name *</label>
                  <input className="input" value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} placeholder="Sunrise Residency" />
                </div>
                {user?.role === 'super_admin' && (
                  <div className="form-group">
                    <label className="label">Assign Agency *</label>
                    <select className="input" value={form.agencyId} onChange={e => setForm(f => ({...f, agencyId: e.target.value}))}>
                      <option value="">Select an Agency</option>
                      {agencies?.map((a: any) => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="form-group">
                  <label className="label">Required Guards</label>
                  <input className="input" type="number" min={1} value={form.requiredGuards} onChange={e => setForm(f => ({...f, requiredGuards: parseInt(e.target.value)}))} />
                </div>
                <div className="form-group md:col-span-2">
                  <label className="label">Address</label>
                  <input className="input" value={form.address} onChange={e => setForm(f => ({...f, address: e.target.value}))} placeholder="Full address" />
                </div>
                <div className="form-group">
                  <label className="label">Contact Person</label>
                  <input className="input" value={form.contactPerson} onChange={e => setForm(f => ({...f, contactPerson: e.target.value}))} />
                </div>
                <div className="form-group">
                  <label className="label">Contact Phone</label>
                  <input className="input" value={form.contactPhone} onChange={e => setForm(f => ({...f, contactPhone: e.target.value}))} />
                </div>
              </div>

              {/* Map */}
              <div className="form-group">
                <label className="label flex items-center gap-2">
                  <Map className="w-4 h-4" /> Select Location on Map
                  <span className="text-xs text-slate-600">(click to pin)</span>
                </label>
                <div className="h-52 rounded-xl overflow-hidden border border-surface-700">
                  <MapContainer center={mapCenter} zoom={14} style={{height:'100%',width:'100%'}}>
                    <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                    <MapClickHandler onLocationSelect={handleMapSelect} />
                    {form.latitude && form.longitude && (
                      <>
                        <Marker position={[form.latitude, form.longitude]} />
                        <Circle
                          center={[form.latitude, form.longitude]}
                          radius={form.geofenceRadius}
                          pathOptions={{ color: '#6366f1', fillColor: '#6366f1', fillOpacity: 0.1 }}
                        />
                      </>
                    )}
                  </MapContainer>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="form-group">
                  <label className="label">Latitude</label>
                  <input className="input" type="number" step="0.0001" value={form.latitude} onChange={e => setForm(f => ({...f, latitude: parseFloat(e.target.value)}))} />
                </div>
                <div className="form-group">
                  <label className="label">Longitude</label>
                  <input className="input" type="number" step="0.0001" value={form.longitude} onChange={e => setForm(f => ({...f, longitude: parseFloat(e.target.value)}))} />
                </div>
                <div className="form-group">
                  <label className="label">Geofence Radius (m)</label>
                  <input className="input" type="number" min={20} max={5000} value={form.geofenceRadius} onChange={e => setForm(f => ({...f, geofenceRadius: parseInt(e.target.value)}))} />
                </div>
              </div>
            </div>

            <div className="flex gap-3 p-5 border-t border-surface-700">
              <button onClick={closeModal} className="btn-ghost px-5 py-2.5">Cancel</button>
              {editSociety && (
                <button onClick={() => { if(confirm('Deactivate this society?')) deactivateMutation.mutate(editSociety.id); closeModal(); }}
                  className="btn-danger px-5 py-2.5 text-sm ml-auto">
                  Deactivate
                </button>
              )}
              <button
                onClick={() => mutation.mutate(form)}
                disabled={mutation.isPending || !form.name || !form.latitude || (user?.role === 'super_admin' && !form.agencyId)}
                className="btn-primary px-5 py-2.5 ml-auto"
              >
                {mutation.isPending ? 'Saving...' : editSociety ? 'Update Society' : 'Add Society'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
