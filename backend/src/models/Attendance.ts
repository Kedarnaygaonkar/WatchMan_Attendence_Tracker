import mongoose, { Schema, Document } from 'mongoose';
import { toJSON } from './plugins/toJSON';

export interface IAttendance extends Document {
  agency_id: mongoose.Types.ObjectId;
  watchman_id: mongoose.Types.ObjectId;
  society_id: mongoose.Types.ObjectId;
  shift_id: mongoose.Types.ObjectId;
  gate_id?: mongoose.Types.ObjectId;
  assignment_id?: mongoose.Types.ObjectId;
  attendance_date: Date; // logical shift date
  check_in_time: Date;
  check_out_time?: Date;
  check_out_selfie_url?: string;
  check_out_latitude?: number;
  check_out_longitude?: number;
  duration_minutes?: number; // calculated on checkout
  latitude?: number;
  longitude?: number;
  gps_accuracy?: number;
  distance_from_society?: number;
  selfie_url?: string;
  device_info?: any;
  status: 'present' | 'late' | 'absent' | 'rejected';
  verification_status: 'verified' | 'warning' | 'suspicious' | 'rejected' | 'review_required';
  gps_flags: string[];
  is_offline_sync: boolean;
  client_timestamp?: Date;
  synced_at?: Date;
  manual_override: boolean;
  override_note?: string;
  override_by?: mongoose.Types.ObjectId;
  override_at?: Date;
  /** Whether the face matched the registered descriptor */
  face_verified?: boolean;
  /** Euclidean distance score (lower = better match, < 0.6 = same person) */
  face_match_score?: number;
  createdAt: Date;
  updatedAt: Date;
}

const attendanceSchema = new Schema<IAttendance>(
  {
    agency_id: { type: Schema.Types.ObjectId, ref: 'Agency', required: true },
    watchman_id: { type: Schema.Types.ObjectId, ref: 'Watchman', required: true },
    society_id: { type: Schema.Types.ObjectId, ref: 'Society', required: true },
    shift_id: { type: Schema.Types.ObjectId, ref: 'Shift', required: true },
    assignment_id: { type: Schema.Types.ObjectId, ref: 'Assignment' },
    gate_id: { type: Schema.Types.ObjectId, ref: 'Gate' },
    attendance_date: { type: Date, required: true },
    check_in_time: { type: Date, required: true },
    check_out_time: { type: Date },
    check_out_selfie_url: { type: String },
    check_out_latitude: { type: Number },
    check_out_longitude: { type: Number },
    duration_minutes: { type: Number },
    latitude: { type: Number },
    longitude: { type: Number },
    gps_accuracy: { type: Number },
    distance_from_society: { type: Number },
    selfie_url: { type: String },
    device_info: { type: Schema.Types.Mixed },
    status: {
      type: String,
      enum: ['present', 'late', 'absent', 'rejected'],
      default: 'present',
    },
    verification_status: {
      type: String,
      enum: ['verified', 'warning', 'suspicious', 'rejected', 'review_required'],
      default: 'verified',
    },
    gps_flags: [{ type: String }],
    is_offline_sync: { type: Boolean, default: false },
    client_timestamp: { type: Date },
    synced_at: { type: Date },
    manual_override: { type: Boolean, default: false },
    override_note: { type: String },
    override_by: { type: Schema.Types.ObjectId, ref: 'User' },
    override_at: { type: Date },
    face_verified: { type: Boolean, default: null },
    face_match_score: { type: Number, default: null },
  },
  { timestamps: true }
);

attendanceSchema.plugin(toJSON);

// Indexes
attendanceSchema.index({ agency_id: 1, attendance_date: -1 }); // Optimized for dashboard/reports
attendanceSchema.index({ watchman_id: 1, shift_id: 1, attendance_date: -1 }); // Optimized for watchman history
attendanceSchema.index({ society_id: 1, attendance_date: -1 }); // Optimized for society history
// Unique attendance per watchman, date, shift (prevents offline sync race conditions)
attendanceSchema.index({ watchman_id: 1, attendance_date: 1, shift_id: 1 }, { unique: true });

export const Attendance = mongoose.model<IAttendance>('Attendance', attendanceSchema);
