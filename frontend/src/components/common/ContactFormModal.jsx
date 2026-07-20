
import { useState, useEffect } from 'react'
import Modal from './Modal'

/**
 * Shared form for Customers and Suppliers — both models are just
 * { name, phone, address }, so one form covers both to avoid duplication.
 */
export default function ContactFormModal({ isOpen, onClose, onSave, initialValues, title, entityLabel }) {
  const [form, setForm] = useState({ name: '', phone: '', address: '' })
  const [errors, setErrors] = useState({})

  useEffect(() => {
    if (isOpen) {
      setForm({
        name: initialValues?.name || '',
        phone: initialValues?.phone || '',
        address: initialValues?.address || '',
      })
      setErrors({})
    }
  }, [isOpen, initialValues])

  function validate() {
    const next = {}
    if (!form.name.trim()) next.name = 'Name is required.'
    if (!form.phone.trim()) next.phone = 'Phone number is required.'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (!validate()) return
    onSave({ name: form.name.trim(), phone: form.phone.trim(), address: form.address.trim() })
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm">
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div>
          <label className="label-text" htmlFor="contact-name">
            Name
          </label>
          <input
            id="contact-name"
            className="input-field"
            value={form.name}
            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
            placeholder={`${entityLabel} name`}
          />
          {errors.name && <p className="text-xs text-rose mt-1">{errors.name}</p>}
        </div>
        <div>
          <label className="label-text" htmlFor="contact-phone">
            Phone
          </label>
          <input
            id="contact-phone"
            className="input-field figure"
            value={form.phone}
            onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
            placeholder="03XX-XXXXXXX"
          />
          {errors.phone && <p className="text-xs text-rose mt-1">{errors.phone}</p>}
        </div>
        <div>
          <label className="label-text" htmlFor="contact-address">
            Address
          </label>
          <textarea
            id="contact-address"
            className="input-field"
            rows={3}
            value={form.address}
            onChange={(e) => setForm((prev) => ({ ...prev, address: e.target.value }))}
            placeholder="Optional address"
          />
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" className="btn-outline transition-all duration-200 hover:-translate-y-0.5" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            className="btn-accent transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_24px_-8px_rgba(232,163,61,0.55)]"
          >
            Save {entityLabel}
          </button>
        </div>
      </form>
    </Modal>
  )
}
