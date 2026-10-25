import { useEffect, useState } from 'react'
import { Slide, ToastContainer } from 'react-toastify'

export { toast } from 'react-toastify'

/** Follows the site's light/dark theme (the `dark` class on <html>), not just the device setting. */
function useDarkTheme() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'))
  useEffect(() => {
    const observer = new MutationObserver(() => setDark(document.documentElement.classList.contains('dark')))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])
  return dark
}

/** Pop-up notifications (react-toastify), styled in index.css to match the site. */
export function Toaster() {
  const dark = useDarkTheme()
  return (
    <ToastContainer
      position="bottom-right"
      autoClose={3500}
      newestOnTop
      closeOnClick
      pauseOnFocusLoss={false}
      transition={Slide}
      theme={dark ? 'dark' : 'light'}
      limit={3}
    />
  )
}
