import mongoose, { Schema, Document } from 'mongoose';
import { toJSON } from './plugins/toJSON';

export type ExpenseCategory =
  | 'daily_wage'
  | 'clothes'
  | 'food'
  | 'travel'
  | 'advance'
  | 'medical'
  | 'equipment'
  | 'bonus'
  | 'other';

export type ExpenseType = 'deduction' | 'earning';

export interface IExpense extends Document {
  agency_id: mongoose.Types.ObjectId;
  watchman_id: mongoose.Types.ObjectId;
  category: ExpenseCategory;
  type: ExpenseType;
  title: string;
  amount: number;
  date: Date;
  notes?: string;
  created_by?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const expenseSchema = new Schema<IExpense>(
  {
    agency_id: { type: Schema.Types.ObjectId, ref: 'Agency', required: true },
    watchman_id: { type: Schema.Types.ObjectId, ref: 'Watchman', required: true },
    category: {
      type: String,
      enum: ['daily_wage', 'clothes', 'food', 'travel', 'advance', 'medical', 'equipment', 'bonus', 'other'],
      required: true,
      default: 'other',
    },
    type: {
      type: String,
      enum: ['deduction', 'earning'],
      required: true,
      default: 'deduction',
    },
    title: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0 },
    date: { type: Date, required: true, default: Date.now },
    notes: { type: String, trim: true },
    created_by: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

expenseSchema.plugin(toJSON);

// Indexes
expenseSchema.index({ agency_id: 1, watchman_id: 1, date: -1 });
expenseSchema.index({ watchman_id: 1, date: -1 });

export const Expense = mongoose.model<IExpense>('Expense', expenseSchema);
