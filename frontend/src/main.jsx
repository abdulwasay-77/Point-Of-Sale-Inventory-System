import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import { CartProvider } from './context/CartContext.jsx'
import { CurrencyProvider } from './context/CurrencyContext.jsx'
import { ThemeProvider } from './context/ThemeContext.jsx'
import { BusinessSettingsProvider } from './context/BusinessSettingsContext.jsx'
import { useCurrency } from './hooks/useCurrency'
import GlobalErrorModal from './components/common/GlobalErrorModal.jsx'
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
        {/* ThemeProvider reads the logged-in user's saved theme preference,
            so it must sit inside AuthProvider */}
        <ThemeProvider>
          {/* Company name/logo for the Sidebar brand mark AND the Login
              page. Uses the full /settings endpoint once authenticated,
              and the unauthenticated /settings/public endpoint before
              that — see BusinessSettingsContext.jsx */}
          <BusinessSettingsProvider>
            {/* CartProvider holds the POS cart — scoped globally so it can
                optionally persist while the cashier navigates away and back */}
            <CartProvider>
              <CurrencyProvider>
                <AppWithCurrencyKey />
              </CurrencyProvider>
            </CartProvider>
          </BusinessSettingsProvider>
        </ThemeProvider>
      </AuthProvider>
      {/* Mounted once, as a sibling to everything above rather than nested
          inside any single page — see GlobalErrorModal.jsx for why it
          needs to live here (outside every route and every page's own
          Modal) to guarantee it always renders on top. */}
      <GlobalErrorModal />
    </BrowserRouter>
  </React.StrictMode>,
)
