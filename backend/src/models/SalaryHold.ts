import mongoose, { Schema, Document } from 'mongoose';
import { toJSON } from './plugins/toJSON';

export interface ISalaryHold extends Document {
  agency_id: mongoose.Types.ObjectId;
  watchman_id: mongoose.Types.ObjectId;
  month: number;
  year: number;
  startDate: Date;
  endDate: Date;
  periodLabel: string;
  dutyDays: number;
  grossSalary: number;
  deductions: number;
  netSalary: number;
  status: 'held' | 'released';
  holdReason: string;
  heldAt: Date;
  heldBy?: mongoose.Types.ObjectId;
  releasedAt?: Date;
  releasedBy?: mongoose.Types.ObjectId;
  paymentMode?: 'cash' | 'bank_transfer' | 'upi' | 'cheque';
  releaseNotes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const salaryHoldSchema = new Schema<ISalaryHold>(
  {
    agency_id: { type: Schema.Types.ObjectId, ref: 'Agency', required: true },
    watchman_id: { type: Schema.Types.ObjectId, ref: 'Watchman', required: true },
    month: { type: Number, required: true },
    year: { type: Number, required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    periodLabel: { type: String, required: true },
    dutyDays: { type: Number, required: true, default: 0 },
    grossSalary: { type: Number, required: true, default: 0 },
    deductions: { type: Number, required: true, default: 0 },
    netSalary: { type: Number, required: true, default: 0 },
    status: {
      type: String,
      enum: ['held', 'released'],
      default: 'held',
      required: true,
    },
    holdReason: {
      type: String,
      default: 'Guard left for other city without collecting salary',
      trim: true,
    },
    heldAt: { type: Date, default: Date.now },
    heldBy: { type: Schema.Types.ObjectId, ref: 'User' },
    releasedAt: { type: Date },
    releasedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    paymentMode: {
      type: String,
      enum: ['cash', 'bank_transfer', 'upi', 'cheque'],
      default: 'cash',
    },
    releaseNotes: { type: String, trim: true },
  },
  { timestamps: true }
);

salaryHoldSchema.plugin(toJSON);

// Indexes
salaryHoldSchema.index({ agency_id: 1, watchman_id: 1, year: 1, month: 1 });
salaryHoldSchema.index({ watchman_id: 1, status: 1 });

export const SalaryHold = mongoose.model<ISalaryHold>('SalaryHold', salaryHoldSchema);

