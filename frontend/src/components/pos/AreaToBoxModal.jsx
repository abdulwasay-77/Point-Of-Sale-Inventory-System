
import { useState, useMemo, useEffect } from 'react'
import Modal from '../common/Modal'

/**
 * FR: Area-to-Box Calculator. Takes floor dimensions + a waste margin
 * (10-15%, per spec), computes total area, and rounds UP to the nearest
 * whole box using the product's coverage-per-box — so staff never bill a
 * fractional box.
 *
 * Premium pass: the computed result is now a receipt-panel-style
 * highlight tile (same signature surface used for dashboard stats and
 * ledger balances elsewhere), so the number staff actually act on — boxes
 * needed — reads as the clear headline instead of one row among several.
 */
export default function AreaToBoxModal({ isOpen, onClose, product, onConfirm }) {
  const [length, setLength] = useState('')
  const [width, setWidth] = useState('')
  const [wastePercent, setWastePercent] = useState(10)
  const [unit, setUnit] = useState('ft') // 'ft' -> sq ft, 'm' -> sq m (coveragePerBox is stored in sq ft)

  useEffect(() => {
    if (isOpen) {
      setLength('')
      setWidth('')
      setWastePercent(10)
      setUnit('ft')
    }
  }, [isOpen])

  const result = useMemo(() => {
    const l = Number(length);
    const w = Number(width);
    if (!l || !w || !product?.coveragePerBox) return null;

    let area = l * w;
    if (unit === 'm') area = area * 10.7639; // sq m -> sq ft, since coveragePerBox is in sq ft

    const adjustedArea = area * (1 + wastePercent / 100);
    const boxes = Math.ceil(adjustedArea / product.coveragePerBox);
    const totalCoverage = boxes * product.coveragePerBox;

    return { area, adjustedArea, boxes, totalCoverage };
  }, [length, width, unit, wastePercent, product]);

  function handleConfirm() {
    if (!result) return
    onConfirm(result.boxes, result)
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Area calculator — ${product?.name || ''}`} size="sm">
      <div className="space-y-4">
        <p className="text-sm text-ink-muted">
          Enter the floor dimensions and a waste margin — this rounds up to the nearest whole box automatically.
        </p>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label-text" htmlFor="calc-length">
              Length
            </label>
            <input
              id="calc-length"
              type="number"
              min="0"
              step="0.1"
              className="input-field figure"
              value={length}
              onChange={(e) => setLength(e.target.value)}
              placeholder="0"
            />
          </div>
          <div>
            <label className="label-text" htmlFor="calc-width">
              Width
            </label>
            <input
              id="calc-width"
              type="number"
              min="0"
              step="0.1"
              className="input-field figure"
              value={width}
              onChange={(e) => setWidth(e.target.value)}
              placeholder="0"
            />
          </div>
        </div>

        <div>
          <label className="label-text" htmlFor="calc-unit">
            Unit
          </label>
          <select id="calc-unit" className="input-field" value={unit} onChange={(e) => setUnit(e.target.value)}>
            <option value="ft">Feet (sq ft)</option>
            <option value="m">Meters (sq m)</option>
          </select>
        </div>

        <div>
          <label className="label-text" htmlFor="calc-waste">
            Waste margin: {wastePercent}%
          </label>
          <input
            id="calc-waste"
            type="range"
            min="10"
            max="15"
            step="1"
            value={wastePercent}
            onChange={(e) => setWastePercent(Number(e.target.value))}
            className="w-full accent-amber"
          />
          <div className="flex justify-between text-xs text-ink-muted mt-1">
            <span>10%</span>
            <span>15%</span>
          </div>
        </div>

        {result && (
          <div className="receipt-panel card-premium glow-amber px-4 py-3.5 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-ink-muted">Total area</span>
              <span className="figure">{result.area.toFixed(1)} sq ft</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-muted">With {wastePercent}% waste</span>
              <span className="figure">{result.adjustedArea.toFixed(1)} sq ft</span>
            </div>
            <div className="flex justify-between items-center font-semibold text-ink pt-2 border-t border-line/70 mt-1.5">
              <span>Boxes needed</span>
              <span className="figure text-lg text-amber-dark">
                {result.boxes} box{result.boxes !== 1 ? 'es' : ''}
              </span>
            </div>
            <div className="flex justify-between text-xs text-ink-muted">
              <span>Covers</span>
              <span className="figure">{result.totalCoverage.toFixed(1)} sq ft</span>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-3 pt-2 border-t border-line">
          <button type="button" className="btn-outline transition-all duration-200 hover:-translate-y-0.5" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            disabled={!result}
            className="btn-accent transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_24px_-8px_rgba(232,163,61,0.55)] disabled:hover:translate-y-0 disabled:hover:shadow-none"
            onClick={handleConfirm}
          >
            Add to Cart
          </button>
        </div>
      </div>
    </Modal>
  )
}
