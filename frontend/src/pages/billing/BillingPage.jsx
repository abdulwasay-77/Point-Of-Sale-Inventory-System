import { useEffect, useState } from 'react'
import axiosInstance from '../../services/axiosInstance'
import { useSubscriptionStatus } from '../../hooks/useSubscriptionStatus'
import { toAssetUrl } from '../../utils/assetUrl'
import Modal from '../../components/common/Modal'
import { isStandalonePwa } from '../../utils/pwa'

export default function BillingPage() {
  const subscription = useSubscriptionStatus()
  const [plans, setPlans] = useState([])
  const [methods, setMethods] = useState([])
  const [submissions, setSubmissions] = useState([])
  const [form, setForm] = useState({ planId: '', payoutMethodId: '', amount: '', referenceNote: '', screenshot: null })
  const [previewUrl, setPreviewUrl] = useState(null)

  const load = async () => {
    const [plansResponse, methodsResponse, submissionsResponse] = await Promise.all([axiosInstance.get('/billing/plans'), axiosInstance.get('/billing/payout-methods'), axiosInstance.get('/billing/submissions')])
    setPlans(plansResponse.data.data); setMethods(methodsResponse.data.data); setSubmissions(submissionsResponse.data.data)
  }
  useEffect(() => { load().catch(() => {}) }, [])
  useEffect(() => { if (subscription?.plan && !form.planId) setForm((current) => ({ ...current, planId: subscription.plan.id })) }, [subscription, form.planId])

  const pending = submissions.find((item) => item.status === 'PENDING')
  const submit = async (event) => {
    event.preventDefault()
    const data = new FormData(); data.append('planId', form.planId); data.append('payoutMethodId', form.payoutMethodId); data.append('amount', form.amount); data.append('referenceNote', form.referenceNote); if (form.screenshot) data.append('screenshot', form.screenshot)
    // This request includes an image file, so it must override the shared
    // JSON default and let multer receive a multipart form body.
    const requestConfig = { headers: { 'Content-Type': 'multipart/form-data' } }
    const request = pending
      ? axiosInstance.put(`/billing/submissions/${pending.id}`, data, requestConfig)
      : axiosInstance.post('/billing/submissions', data, requestConfig)
    await request; await load()
  }

  const handleOpenProof = (e, url) => {
    if (isStandalonePwa()) {
      e.preventDefault()
      setPreviewUrl(url)
    }
  }

  return <div className="max-w-3xl mx-auto space-y-6">
    <div><h1 className="font-display text-2xl font-semibold text-ink dark:text-dark-text">Billing</h1><p className="text-sm text-ink-muted dark:text-dark-muted">Manage your plan and submit payment proof for review.</p></div>
    {subscription && <div className={`rounded-xl border p-5 ${subscription.status === 'SUSPENDED' ? 'border-rose bg-rose-light dark:bg-dark-rose/10' : 'border-line dark:border-dark-border bg-white dark:bg-dark-card'}`}><p className="font-medium text-ink dark:text-dark-text">{subscription.plan.name} · {subscription.status}</p><p className="text-sm text-ink-muted dark:text-dark-muted">Current period ends {new Date(subscription.currentPeriodEnd).toLocaleDateString()} ({subscription.daysRemaining} days remaining)</p>{subscription.status === 'SUSPENDED' && <p className="mt-2 text-sm text-rose">Your account is suspended until a payment is approved.</p>}</div>}
    <form onSubmit={submit} className="rounded-xl border border-line dark:border-dark-border bg-white dark:bg-dark-card p-5 space-y-4"><h2 className="font-display text-lg font-semibold text-ink dark:text-dark-text">{pending ? 'Update pending payment' : 'Submit payment'}</h2><select required value={form.planId} onChange={(e) => setForm({ ...form, planId: e.target.value })} className="input w-full"><option value="">Choose a plan</option>{plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name} ({plan.price})</option>)}</select><select required value={form.payoutMethodId} onChange={(e) => setForm({ ...form, payoutMethodId: e.target.value })} className="input w-full"><option value="">Choose a payout method</option>{methods.map((method) => <option key={method.id} value={method.id}>{method.label} — {method.accountNumber}</option>)}</select><input required type="number" min="0.01" step="0.01" placeholder="Amount paid" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="input w-full"/><textarea placeholder="Reference or note" value={form.referenceNote} onChange={(e) => setForm({ ...form, referenceNote: e.target.value })} className="input w-full"/><input required={!pending} type="file" accept="image/*" onChange={(e) => setForm({ ...form, screenshot: e.target.files[0] || null })} className="block w-full text-sm"/><button className="btn-accent" type="submit">{pending ? 'Update submission' : 'Submit for review'}</button></form>
    {submissions.length > 0 && <div className="rounded-xl border border-line dark:border-dark-border bg-white dark:bg-dark-card p-5"><h2 className="font-display text-lg font-semibold text-ink dark:text-dark-text mb-3">Submission history</h2>{submissions.map((item) => <div key={item.id} className="py-3 border-t border-line dark:border-dark-border text-sm"><span className="font-medium">{item.plan.name}</span> · {item.status} · {item.amount}{item.rejectionReason && <p className="text-rose">Reason: {item.rejectionReason}</p>}<a className="text-accent underline ml-2 cursor-pointer" href={toAssetUrl(item.screenshotUrl)} onClick={(e) => handleOpenProof(e, toAssetUrl(item.screenshotUrl))} target="_blank" rel="noreferrer">View proof</a></div>)}</div>}

    {previewUrl && (
      <Modal isOpen={!!previewUrl} onClose={() => setPreviewUrl(null)} title="Payment Proof" size="lg">
        <div className="flex flex-col items-center justify-center">
          <div className="max-h-[65vh] w-full overflow-hidden rounded-xl border border-line dark:border-dark-border bg-paper-dim/40 dark:bg-dark-card2 flex items-center justify-center p-3">
            <img src={previewUrl} alt="Payment Proof" className="max-h-[60vh] max-w-full object-contain rounded-lg shadow-sm" />
          </div>
          <div className="mt-4 flex justify-end w-full">
            <button type="button" onClick={() => setPreviewUrl(null)} className="btn-primary">
              Close
            </button>
          </div>
        </div>
      </Modal>
    )}
  </div>
}

