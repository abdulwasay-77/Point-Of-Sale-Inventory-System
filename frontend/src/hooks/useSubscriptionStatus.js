import { useEffect, useState } from 'react'
import axiosInstance from '../services/axiosInstance'

export function useSubscriptionStatus() {
  const [subscription, setSubscription] = useState(null)

  useEffect(() => {
    let mounted = true
    axiosInstance.get('/billing/subscription', { skipGlobalError: true })
      .then((response) => { if (mounted) setSubscription(response.data.data) })
      .catch(() => {})
    return () => { mounted = false }
  }, [])

  return subscription
}
