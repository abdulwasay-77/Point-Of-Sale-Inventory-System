
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import { CartProvider } from './context/CartContext.jsx'
import { CurrencyProvider } from './context/CurrencyContext.jsx'
import { useCurrency } from './hooks/useCurrency'
import './index.css'

// Remounts <App> whenever the selected currency changes, so every price
// already on screen re-renders with the new conversion immediately.
function AppWithCurrencyKey() {
  const { currencyCode } = useCurrency()
  return <App key={currencyCode} />
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      {/* AuthProvider must wrap the whole app so any page can read auth state */}
      <AuthProvider>
        {/* CartProvider holds the POS cart — scoped globally so it can
            optionally persist while the cashier navigates away and back */}
        <CartProvider>
          <CurrencyProvider>
            <AppWithCurrencyKey />
          </CurrencyProvider>
        </CartProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
