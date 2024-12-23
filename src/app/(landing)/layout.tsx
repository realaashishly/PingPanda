import { ReactNode } from "react"
import Navbar from "../../components/navbar"

export default function layout({ children }: { children: ReactNode }) {
  return (
    <>
      <Navbar />
      {children}
    </>
  )
}
