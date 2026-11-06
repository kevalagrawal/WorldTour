import mongoose from 'mongoose'

/**
 * A spare key for an outside API, added in the admin dashboard (source "admin", stored encrypted),
 * or the status of the key set in the planner's Vercel environment (source "env", no secret stored).
 */
const apiKeySchema = new mongoose.Schema(
  {
    service: { type: String, required: true, index: true },
    source: { type: String, enum: ['admin', 'env'], default: 'admin' },
    label: { type: String, trim: true, maxlength: 60, default: '' },
    secret: { iv: String, data: String, tag: String },
    last4: { type: String, default: '' },
    status: { type: String, enum: ['active', 'exhausted', 'invalid'], default: 'active' },
    lastError: { type: String, default: '', maxlength: 300 },
    exhaustedAt: { type: Date, default: null },
    lastUsedAt: { type: Date, default: null },
    credits: { type: mongoose.Schema.Types.Mixed, default: null },
    checkedAt: { type: Date, default: null },
  },
  { timestamps: true },
)

apiKeySchema.methods.toAdmin = function toAdmin() {
  return {
    id: this._id.toString(),
    service: this.service,
    source: this.source,
    label: this.label,
    masked: this.last4 ? `••••••••${this.last4}` : '',
    status: this.status,
    lastError: this.lastError,
    exhaustedAt: this.exhaustedAt,
    lastUsedAt: this.lastUsedAt,
    credits: this.credits,
    checkedAt: this.checkedAt,
    createdAt: this.createdAt,
  }
}

export const ApiKey = mongoose.models.ApiKey || mongoose.model('ApiKey', apiKeySchema)
