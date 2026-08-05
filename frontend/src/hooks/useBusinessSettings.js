import { useContext } from 'react'
import { BusinessSettingsContext } from '../context/BusinessSettingsContext'

export function useBusinessSettings() {
  const context = useContext(BusinessSettingsContext)
  if (!context) {
    throw new Error('useBusinessSettings must be used within a BusinessSettingsProvider')
  }
  return context
}