import mongoose, { Schema, Document } from 'mongoose';
import { toJSON } from './plugins/toJSON';

export interface IDeliveryVisit extends Document {
  agency_id: mongoose.Types.ObjectId;
  society_id: mongoose.Types.ObjectId;
  gate_id?: mongoose.Types.ObjectId;
  gate_token: string;           // which gate QR was scanned
  visitor_name: string;
  visitor_phone: string;
  vehicle_number?: string;
  delivery_company: string;     // e.g. Zomato, Swiggy, Amazon, Other
  check_in_time: Date;
  check_out_time?: Date;
  duration_minutes?: number;
  visit_date: Date;             // date-only (midnight UTC)
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const deliveryVisitSchema = new Schema<IDeliveryVisit>(
  {
    agency_id: { type: Schema.Types.ObjectId, ref: 'Agency', required: true },
    society_id: { type: Schema.Types.ObjectId, ref: 'Society', required: true },
    gate_id: { type: Schema.Types.ObjectId, ref: 'Gate' },
    gate_token: { type: String, required: true },
    visitor_name: { type: String, required: true, trim: true },
    visitor_phone: { type: String, required: true, trim: true },
    vehicle_number: { type: String, trim: true },
    delivery_company: { type: String, required: true, default: 'Other' },
    check_in_time: { type: Date, required: true },
    check_out_time: { type: Date },
    duration_minutes: { type: Number },
    visit_date: { type: Date, required: true },
    notes: { type: String },
  },
  { timestamps: true }
);

deliveryVisitSchema.plugin(toJSON);

// Indexes for quick lookup
deliveryVisitSchema.index({ agency_id: 1, visit_date: -1 });
deliveryVisitSchema.index({ society_id: 1, visit_date: -1 });
deliveryVisitSchema.index({ gate_token: 1 });

export const DeliveryVisit = mongoose.model<IDeliveryVisit>('DeliveryVisit', deliveryVisitSchema);
