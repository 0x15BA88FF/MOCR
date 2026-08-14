import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom"
import { Toaster } from "./components/ui/sonner"
import Telescope from "./pages/Telescope"

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/telescope" replace />} />
        <Route path="/telescope" element={<Telescope />} />
      </Routes>
      <Toaster position="bottom-left" />
    </BrowserRouter>
  )
}

export default App