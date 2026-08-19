import React from "react"
import { Home } from "./chat-template"
import { SidebarProvider } from "./sidebar"

export function Demo() {
  return (
    <SidebarProvider>
      <Home />
    </SidebarProvider>
  )
}
