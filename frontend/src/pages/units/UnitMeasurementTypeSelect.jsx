const TYPES = [
  ['COUNT', 'Count — pieces, boxes, cartons, packs'],
  ['AREA', 'Area — square metres, square feet'],
  ['LENGTH', 'Length — metres, feet'],
  ['WEIGHT', 'Weight — kilograms, grams'],
  ['VOLUME', 'Volume — litres, millilitres'],
  ['OTHER', 'Other — business-specific measurement'],
]

export default function UnitMeasurementTypeSelect({ value, onChange, disabled = false }) {
  return (
    <div>
      <label className="label-text" htmlFor="unit-measurement-type">Measurement type</label>
      <select id="unit-measurement-type" className="input-field" value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
        {TYPES.map(([type, label]) => <option key={type} value={type}>{label}</option>)}
      </select>
      <p className="text-xs text-ink-muted dark:text-dark-muted mt-1">This describes the unit’s meaning; it is not guessed from its name.</p>
    </div>
  )
}