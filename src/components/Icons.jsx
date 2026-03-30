const Icon = ({ size = 16, children, ...props }) => (
  <svg
    width={size} height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    {children}
  </svg>
)

export const IconLogo = ({ size = 32, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <rect width="48" height="48" rx="14" fill="#4F9CF9"/>
    <path d="M10 32 Q 24 42, 38 32" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeDasharray="1, 5" opacity="0.5" />
    <path d="M24 8 C 17.5 8, 13 12.5, 13 19 C 13 26, 24 36, 24 36 C 24 36, 35 26, 35 19 C 35 12.5, 30.5 8, 24 8 Z" fill="white" />
    <circle cx="24" cy="18.5" r="3.5" fill="#4F9CF9" />
  </svg>
)

export const IconPlane = (p) => (
  <Icon size={20} {...p}>
    <path d="M17.8 19.2L16 11l3.5-3.5C21 6 21 4 19 4s-2 1-3.5 2.5L9 8.2l-8-1.8 4 4L3 15l3-1 1 3 4-4z" fill="currentColor" stroke="none"/>
  </Icon>
)

export const IconUndo = (p) => (
  <Icon {...p}>
    <path d="M9 14 4 9l5-5"/>
    <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>
  </Icon>
)

export const IconRedo = (p) => (
  <Icon {...p}>
    <path d="m15 14 5-5-5-5"/>
    <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>
  </Icon>
)

export const IconLink = (p) => (
  <Icon {...p}>
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
  </Icon>
)

export const IconQR = (p) => (
  <Icon {...p}>
    <rect x="3" y="3" width="7" height="7"/>
    <rect x="14" y="3" width="7" height="7"/>
    <rect x="3" y="14" width="7" height="7"/>
    <rect x="14" y="14" width="3" height="3"/>
    <rect x="18" y="14" width="3" height="3"/>
    <rect x="14" y="18" width="3" height="3"/>
    <rect x="18" y="18" width="3" height="3"/>
  </Icon>
)

export const IconShare = (p) => (
  <Icon {...p}>
    <circle cx="18" cy="5" r="3"/>
    <circle cx="6" cy="12" r="3"/>
    <circle cx="18" cy="19" r="3"/>
    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
  </Icon>
)

export const IconEdit = (p) => (
  <Icon {...p}>
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
  </Icon>
)

export const IconTrash = (p) => (
  <Icon {...p}>
    <polyline points="3 6 5 6 21 6"/>
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
    <path d="M10 11v6"/>
    <path d="M14 11v6"/>
    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
  </Icon>
)

export const IconSearch = (p) => (
  <Icon {...p}>
    <circle cx="11" cy="11" r="8"/>
    <line x1="21" y1="21" x2="16.65" y2="16.65"/>
  </Icon>
)

export const IconPin = (p) => (
  <Icon {...p}>
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
    <circle cx="12" cy="10" r="3"/>
  </Icon>
)

export const IconMap = (p) => (
  <Icon size={48} {...p}>
    <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/>
    <line x1="8" y1="2" x2="8" y2="18"/>
    <line x1="16" y1="6" x2="16" y2="22"/>
  </Icon>
)

export const IconPlus = (p) => (
  <Icon {...p}>
    <line x1="12" y1="5" x2="12" y2="19"/>
    <line x1="5" y1="12" x2="19" y2="12"/>
  </Icon>
)

export const IconClose = (p) => (
  <Icon {...p}>
    <line x1="18" y1="6" x2="6" y2="18"/>
    <line x1="6" y1="6" x2="18" y2="18"/>
  </Icon>
)

export const IconChevronLeft = (p) => (
  <Icon {...p}><polyline points="15 18 9 12 15 6"/></Icon>
)

export const IconChevronRight = (p) => (
  <Icon {...p}><polyline points="9 18 15 12 9 6"/></Icon>
)

export const IconClock = (p) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="10"/>
    <polyline points="12 6 12 12 16 14"/>
  </Icon>
)

export const IconCalendar = (p) => (
  <Icon {...p}>
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
    <line x1="16" y1="2" x2="16" y2="6"/>
    <line x1="8" y1="2" x2="8" y2="6"/>
    <line x1="3" y1="10" x2="21" y2="10"/>
  </Icon>
)

export const IconLocation = (p) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="3"/>
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>
    <path d="M4.93 4.93l2.12 2.12M16.95 16.95l2.12 2.12M4.93 19.07l2.12-2.12M16.95 7.05l2.12-2.12"/>
  </Icon>
)

export const IconCheck = (p) => (
  <Icon {...p}><polyline points="20 6 9 17 4 12"/></Icon>
)

export const IconChevronDown = (p) => (
  <Icon {...p}><polyline points="6 9 12 15 18 9"/></Icon>
)

export const IconGrip = (p) => (
  <Icon {...p}>
    <circle cx="9" cy="8" r="1.5" fill="currentColor" stroke="none"/>
    <circle cx="15" cy="8" r="1.5" fill="currentColor" stroke="none"/>
    <circle cx="9" cy="13" r="1.5" fill="currentColor" stroke="none"/>
    <circle cx="15" cy="13" r="1.5" fill="currentColor" stroke="none"/>
    <circle cx="9" cy="18" r="1.5" fill="currentColor" stroke="none"/>
    <circle cx="15" cy="18" r="1.5" fill="currentColor" stroke="none"/>
  </Icon>
)

export const IconNaver = (p) => (
  <Icon size={14} viewBox="0 0 24 24" stroke="none" fill="currentColor" {...p}>
    <path d="M16.2 4H20v16h-3.8l-8.4-12V20H4V4h3.8l8.4 12V4z"/>
  </Icon>
)

export const IconLoader = (p) => (
  <Icon {...p} className={`icon-spin ${p.className || ''}`}>
    <line x1="12" y1="2" x2="12" y2="6"/>
    <line x1="12" y1="18" x2="12" y2="22"/>
    <line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/>
    <line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/>
    <line x1="2" y1="12" x2="6" y2="12"/>
    <line x1="18" y1="12" x2="22" y2="12"/>
    <line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/>
    <line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/>
  </Icon>
)

export const IconLock = (p) => (
  <Icon {...p}>
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
  </Icon>
)

export const IconUnlock = (p) => (
  <Icon {...p}>
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
    <path d="M7 11V7a5 5 0 0 1 9.9-1"/>
  </Icon>
)
