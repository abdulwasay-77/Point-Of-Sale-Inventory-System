
import { useContext } from 'react'
import { CartContext } from '../context/CartContext'

// Convenience hook for accessing the POS cart state.
export function useCart() {
  const context = useContext(CartContext)
  if (!context) {
    throw new Error('useCart must be used within a CartProvider')
  }
  return context
}
