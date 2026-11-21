export interface NavItem { label: string; to: string; end?: boolean }

export const mainNav: NavItem[] = [
  { label: 'Home', to: '/', end: true },
  { label: 'About Us', to: '/about' },
  { label: 'Features', to: '/features' },
  { label: 'Blog', to: '/blog' },
  { label: 'Contact Us', to: '/contact' },
];

export const footerColumns: { title: string; links: NavItem[] }[] = [
  {
    title: 'Sathi',
    links: [
      { label: 'Home', to: '/' },
      { label: 'About Us', to: '/about' },
      { label: 'Features', to: '/features' },
      { label: 'Blog', to: '/blog' },
    ],
  },
  {
    title: 'For you',
    links: [
      { label: 'Young people', to: '/features#youth' },
      { label: 'Counselors', to: '/features#counselors' },
      { label: 'Organizations', to: '/features#organizations' },
      { label: 'Safety & privacy', to: '/features#safety' },
    ],
  },
  {
    title: 'Get help',
    links: [
      { label: 'Contact Us', to: '/contact' },
      { label: 'Urgent help', to: '/safety' },
      { label: 'Log in', to: '/login' },
      { label: 'Create an account', to: '/register' },
    ],
  },
];
