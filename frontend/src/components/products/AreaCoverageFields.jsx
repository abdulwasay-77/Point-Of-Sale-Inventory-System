export default function AreaCoverageFields({ enabled, onEnabledChange, quantity, unitId, units, saleUnitLabel = 'sale unit', onChange }) {
  const areaUnits = units.filter((unit) => unit.measurementType === 'AREA')

  return (
    <div className="sm:col-span-2 space-y-3 border-t border-line dark:border-dark-border pt-4">
      <label className="flex items-start gap-2.5 text-sm text-ink dark:text-dark-text cursor-pointer">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => onEnabledChange(event.target.checked)}
          className="mt-0.5 rounded border-line dark:border-dark-border text-amber focus:ring-amber"
        />
        <span>
          <span className="font-medium">This product package covers an area</span>
          <span className="block text-xs text-ink-muted dark:text-dark-muted mt-0.5">Optional. The POS can calculate how many sale units are needed for a customer’s area.</span>
        </span>
      </label>

      {enabled && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pl-7">
          <div>
            <label className="label-text" htmlFor="coverage-quantity">One {saleUnitLabel} covers</label>
            <input id="coverage-quantity" type="number" min="0.01" step="0.01" className="input-field figure" value={quantity} onChange={(event) => onChange('coverageQuantity', event.target.value)} placeholder="e.g. 1.44" />
          </div>
          <div>
            <label className="label-text" htmlFor="coverage-unit">Area unit</label>
            <select id="coverage-unit" className="input-field" value={unitId} onChange={(event) => onChange('coverageUomId', event.target.value)}>
              <option value="">Select an area unit</option>
              {areaUnits.map((unit) => <option key={unit.id} value={unit.id}>{unit.name} ({unit.abbreviation})</option>)}
            </select>
            {areaUnits.length === 0 && <p className="text-xs text-rose dark:text-dark-rose mt-1">Add an Area unit on the Units of Measure page first.</p>}
          </div>
        </div>
      )}
    </div>
  )
}