import { useEffect, useMemo, useState } from 'react'
import Modal from '../common/Modal'

export default function AreaCoverageCalculatorModal({ isOpen, onClose, product, onConfirm }) {
  const [requiredArea, setRequiredArea] = useState('')
  const [wastePercent, setWastePercent] = useState('10')

  useEffect(() => { if (isOpen) { setRequiredArea(''); setWastePercent('10') } }, [isOpen])

  const result = useMemo(() => {
    const area = Number(requiredArea)
    const coverage = Number(product?.coverageQuantity)
    const waste = Number(wastePercent || 0)
    if (!(area > 0) || !(coverage > 0) || waste < 0) return null
    const areaWithWaste = area * (1 + waste / 100)
    const quantity = Math.ceil(areaWithWaste / coverage)
    return { areaWithWaste, quantity, totalCoverage: quantity * coverage }
  }, [product, requiredArea, wastePercent])

  const saleUnit = product?.baseUomAbbreviation || product?.baseUom || 'units'
  const areaUnit = product?.coverageUomAbbreviation || product?.coverageUom || 'area units'

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Area calculator — ${product?.name || ''}`} size="sm">
      <div className="space-y-4">
        <p className="text-sm text-ink-muted dark:text-dark-muted">One {saleUnit} covers {product?.coverageQuantity} {areaUnit}.</p>
        <div>
          <label className="label-text" htmlFor="required-area">Area required ({areaUnit})</label>
          <input id="required-area" type="number" min="0.01" step="0.01" className="input-field figure" value={requiredArea} onChange={(event) => setRequiredArea(event.target.value)} />
        </div>
        <div>
          <label className="label-text" htmlFor="waste-percent">Waste allowance (%)</label>
          <input id="waste-percent" type="number" min="0" max="100" step="1" className="input-field figure" value={wastePercent} onChange={(event) => setWastePercent(event.target.value)} />
        </div>
        {result && <div className="receipt-panel card-premium px-4 py-3 text-sm space-y-1"><div className="flex justify-between"><span>Area with waste</span><strong>{result.areaWithWaste.toFixed(2)} {areaUnit}</strong></div><div className="flex justify-between text-lg"><span>Required to sell</span><strong className="text-amber-dark dark:text-amber">{result.quantity} {saleUnit}</strong></div><div className="flex justify-between text-xs text-ink-muted dark:text-dark-muted"><span>Total coverage</span><span>{result.totalCoverage.toFixed(2)} {areaUnit}</span></div></div>}
      </div>
      <div className="flex justify-end gap-3 pt-4 mt-4 border-t border-line dark:border-dark-border"><button type="button" className="btn-outline" onClick={onClose}>Cancel</button><button type="button" className="btn-accent" disabled={!result} onClick={() => onConfirm(result.quantity, result)}>Add to cart</button></div>
    </Modal>
  )
}