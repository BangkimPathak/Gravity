"use client"

import React, { useState } from "react"

import {
  SidebarInset,
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  useSidebar,
} from "./sidebar"

import {
  Archive,
  Brush,
  Camera,
  ChartBarIncreasing,
  ChevronUp,
  CircleFadingPlus,
  CircleOff,
  CircleUserRound,
  File,
  Image,
  ListFilter,
  Menu,
  MessageCircle,
  MessageSquareDashed,
  MessageSquareDot,
  Mic,
  Paperclip,
  Search,
  Send,
  Settings,
  Smile,
  SquarePen,
  Star,
  User,
  User2,
  UserRound,
  Users,
} from "lucide-react"

// ** Contact List **
const contactList = [
  {
    name: "Manoj Rayi",
    message: "Your Last Message Here",
    image: "https://github.com/rayimanoj8.png",
  },
  {
    name: "Anjali Kumar",
    message: "Hello, how are you?",
    image: "https://randomuser.me/api/portraits/women/2.jpg",
  },
  {
    name: "Ravi Teja",
    message: "Looking forward to the meeting.",
    image: "https://randomuser.me/api/portraits/men/3.jpg",
  },
  {
    name: "Sneha Reddy",
    message: "Can you send the report?",
    image: "https://randomuser.me/api/portraits/women/4.jpg",
  },
  {
    name: "Arjun Das",
    message: "Thank you for your help!",
    image: "https://randomuser.me/api/portraits/men/5.jpg",
  },
  {
    name: "Priya Sharma",
    message: "Let's catch up soon.",
    image: "https://randomuser.me/api/portraits/women/6.jpg",
  },
  {
    name: "Vikram Singh",
    message: "I will call you later.",
    image: "https://randomuser.me/api/portraits/men/7.jpg",
  },
  {
    name: "Kavya Rao",
    message: "Did you receive my email?",
    image: "https://randomuser.me/api/portraits/women/8.jpg",
  },
  {
    name: "Rahul Verma",
    message: "Meeting rescheduled to tomorrow.",
    image: "https://randomuser.me/api/portraits/men/9.jpg",
  },
  {
    name: "Deepika Nair",
    message: "Happy birthday! Have a great day!",
    image: "https://randomuser.me/api/portraits/women/10.jpg",
  },
]

// ** Sidebar Menu Items **
const menuItems = [
  { title: "Messages", url: "#", icon: MessageCircle },
]

export const Home = () => {
  const { toggleSidebar } = useSidebar()
  const [currentChat, setCurrentChat] = useState(contactList[0])

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      {/* Floating Collapsible Sidebar */}
      <Sidebar variant="floating" collapsible="icon">
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Navigate</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {menuItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton>
                      <item.icon className="size-4" />
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton>
                <User2 className="size-4" />
                <span>Manoj Rayi</span>
                <ChevronUp className="ml-auto size-4" />
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>

      {/* Main Content Area */}
      <SidebarInset className="flex-1 flex flex-row">
        {/* Left Panel: Chat List (25%) */}
        <div className="w-80 border-r flex flex-col h-full bg-card">
          <div className="h-16 px-4 flex items-center justify-between border-b">
            <h2 className="text-xl font-bold">Chats</h2>
            <div className="flex items-center gap-1">
              <button className="p-2 rounded-lg hover:bg-secondary transition-colors" title="New Direct Chat">
                <SquarePen className="size-5 text-muted-foreground" />
              </button>
              <button className="p-2 rounded-lg hover:bg-secondary transition-colors" title="Create Group">
                <Users className="size-5 text-muted-foreground" />
              </button>
              <button className="p-2 rounded-lg hover:bg-secondary transition-colors" title="Archived Messages">
                <Archive className="size-5 text-muted-foreground" />
              </button>
            </div>
          </div>

          {/* Search Bar */}
          <div className="p-3 border-b">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search or start new chat"
                className="w-full bg-secondary/50 border rounded-lg pl-9 pr-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          {/* Archived Chats Quick Row */}
          <button className="w-full px-4 py-3 border-b flex items-center justify-between hover:bg-secondary/60 transition-colors text-left">
            <div className="flex items-center gap-3">
              <div className="size-8 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                <Archive className="size-4" />
              </div>
              <span className="font-semibold text-sm">Archived</span>
            </div>
            <span className="text-xs bg-secondary px-2 py-0.5 rounded-full font-medium text-muted-foreground">0</span>
          </button>

          {/* Contact List */}
          <div className="flex-1 overflow-y-auto divide-y divide-border/50">
            {contactList.map((contact, index) => (
              <button
                key={index}
                onClick={() => setCurrentChat(contact)}
                className={`w-full p-3 flex items-center gap-3 hover:bg-secondary/60 transition-colors text-left ${
                  currentChat?.name === contact.name ? "bg-secondary" : ""
                }`}
              >
                <img src={contact.image} alt={contact.name} className="size-12 rounded-full object-cover" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-sm truncate">{contact.name}</p>
                    <span className="text-xs text-muted-foreground">12:45 PM</span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{contact.message}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Right Panel: Chat Window (75%) */}
        <div className="flex-1 flex flex-col h-full bg-background">
          {/* Header */}
          <div className="h-16 px-4 border-b flex items-center justify-between bg-card">
            <div className="flex items-center gap-3">
              <img src={currentChat?.image} alt={currentChat?.name} className="size-10 rounded-full object-cover" />
              <div>
                <h3 className="font-semibold text-sm">{currentChat?.name}</h3>
                <p className="text-xs text-muted-foreground">Online</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button className="p-2 rounded-lg hover:bg-secondary text-muted-foreground" title="Search">
                <Search className="size-5" />
              </button>
            </div>
          </div>

          {/* Messages Viewport */}
          <div className="flex-1 p-4 overflow-y-auto flex flex-col gap-3">
            <div className="self-center bg-muted/40 text-muted-foreground text-xs px-3 py-1 rounded-full">
              Messages are end-to-end encrypted
            </div>
            <div className="self-start max-w-md bg-card border p-3 rounded-2xl rounded-tl-sm text-sm">
              Hello! Welcome to Gravity Messenger.
            </div>
            <div className="self-end max-w-md bg-primary text-primary-foreground p-3 rounded-2xl rounded-tr-sm text-sm">
              Thanks! The real-time interface is super fast.
            </div>
          </div>

          {/* Input Bar */}
          <div className="p-3 border-t bg-card flex items-center gap-2">
            <button className="p-2 rounded-lg hover:bg-secondary text-muted-foreground">
              <Smile className="size-5" />
            </button>
            <button className="p-2 rounded-lg hover:bg-secondary text-muted-foreground">
              <Paperclip className="size-5" />
            </button>
            <input
              type="text"
              placeholder="Type a message"
              className="flex-1 bg-secondary/50 border rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <button className="p-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90">
              <Send className="size-5" />
            </button>
            <button className="p-2 rounded-lg hover:bg-secondary text-muted-foreground">
              <Mic className="size-5" />
            </button>
          </div>
        </div>
      </SidebarInset>
    </div>
  )
}
