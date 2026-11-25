import { StrictMode, Suspense, lazy, type ReactNode, type ComponentType } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import './index.css';
import { AuthProvider, useAuth, type User } from './lib/auth';
import DashboardLayout from './layouts/DashboardLayout';
import { Login, Register, VerifyEmail, ForgotPassword, ResetPassword, homeFor } from './features/auth/Auth';
import { LoadingBlock, UiProvider } from './components/ui';

const L = <T extends Record<string, unknown>>(f: () => Promise<T>, name: keyof T) => lazy(() => f().then((m) => ({ default: m[name] as unknown as ComponentType })));
// Youth
const yc = () => import('./features/youth/core');
const yj = () => import('./features/youth/journey');
const yx = () => import('./features/youth/explore');
const YouthHome = L(yc, 'YouthHome'), CheckInWizard = L(yc, 'CheckInWizard'), AssessmentWizard = L(yc, 'AssessmentWizard'), Matches = L(yc, 'Matches');
const CounselorBooking = L(yc, 'CounselorBooking'), PaymentResult = L(yc, 'PaymentResult'), YouthAppointments = L(yj, 'YouthAppointments');
const Journey = L(yj, 'Journey'), JourneyDetail = L(yj, 'JourneyDetail'), Progress = L(yj, 'ProgressPage');
const Programs = L(yx, 'Programs'), ProgramDetail = L(yx, 'ProgramDetail'), Privacy = L(yx, 'PrivacyCenter');
// Shared
const sh = () => import('./features/shared/index');
const Community = L(sh, 'Community'), CommunityPost = L(sh, 'CommunityPost'), MyContent = L(sh, 'MyCommunityContent'), Resources = L(sh, 'Resources');
const Notifications = L(sh, 'Notifications'), Settings = L(sh, 'Settings'), Safety = L(sh, 'Safety');
// Counselor
const co = () => import('./features/counselor/index');
const CounselorHome = L(co, 'CounselorHome'), CounselorAppointments = L(co, 'CounselorAppointments'), Clients = L(co, 'Clients'), ClientDetail = L(co, 'ClientDetail');
const Availability = L(co, 'Availability'), CounselorProfile = L(co, 'CounselorProfile'), CounselorGoogle = L(co, 'CounselorGoogle');
// Organization
const og = () => import('./features/organization/index');
const OrgHome = L(og, 'OrgHome'), OrgPrograms = L(og, 'OrgPrograms'), OrgProgramDetail = L(og, 'OrgProgramDetail'), OrgServices = L(og, 'OrgServices'), OrgProfile = L(og, 'OrgProfile');
// Admin
const ad = () => import('./features/admin/index');
const AdminHome = L(ad, 'AdminHome'), AdminUsers = L(ad, 'AdminUsers'), AdminVerifications = L(ad, 'AdminVerifications'), AdminApprovals = L(ad, 'AdminApprovals');
const AdminModeration = L(ad, 'AdminModeration'), AdminResources = L(ad, 'AdminResources'), AdminAssessment = L(ad, 'AdminAssessment'), AdminMatching = L(ad, 'AdminMatching');
const cms = () => import('./features/admin/cms');
const AdminBlog = L(cms, 'AdminBlog'), AdminContact = L(cms, 'AdminContact');
const AdminPayments = L(ad, 'AdminPayments'), AdminAudit = L(ad, 'AdminAudit'), AdminSettings = L(ad, 'AdminSettings'), AdminJobs = L(ad, 'AdminJobs');

// Public marketing site — lazy-loaded so the dashboard bundle is unaffected
const MarketingLayout = lazy(() => import('./marketing/layouts/MarketingLayout'));
const HomePage = lazy(() => import('./marketing/pages/HomePage'));
const AboutPage = lazy(() => import('./marketing/pages/AboutPage'));
const FeaturesPage = lazy(() => import('./marketing/pages/FeaturesPage'));
const ContactPage = lazy(() => import('./marketing/pages/ContactPage'));
const BlogPage = lazy(() => import('./marketing/pages/BlogPage'));
const BlogDetailPage = lazy(() => import('./marketing/pages/BlogDetailPage'));

const qc = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 15_000, refetchOnWindowFocus: false } } });

function Guard({ roles, children }: { roles?: User['role'][]; children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-8"><LoadingBlock /></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to={homeFor(user.role)} replace />;
  return <Suspense fallback={<LoadingBlock />}>{children}</Suspense>;
}
const Y = (n: ReactNode) => <Guard roles={['YOUTH']}>{n}</Guard>;
const C = (n: ReactNode) => <Guard roles={['COUNSELOR']}>{n}</Guard>;
const O = (n: ReactNode) => <Guard roles={['ORGANIZATION']}>{n}</Guard>;
const A = (n: ReactNode) => <Guard roles={['ADMIN']}>{n}</Guard>;
const Any = (n: ReactNode) => <Guard>{n}</Guard>;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <UiProvider>
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              <Route element={<Suspense fallback={null}><MarketingLayout /></Suspense>}>
                <Route path="/" element={<HomePage />} />
                <Route path="/about" element={<AboutPage />} />
                <Route path="/features" element={<FeaturesPage />} />
                <Route path="/contact" element={<ContactPage />} />
                <Route path="/blog" element={<BlogPage />} />
                <Route path="/blog/:slug" element={<BlogDetailPage />} />
              </Route>
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/verify-email" element={<VerifyEmail />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route element={<DashboardLayout />}>
                <Route path="/youth" element={Y(<YouthHome />)} />
                <Route path="/youth/check-in" element={Y(<CheckInWizard />)} />
                <Route path="/youth/assessment" element={Y(<AssessmentWizard />)} />
                <Route path="/youth/matches" element={Y(<Matches />)} />
                <Route path="/youth/counselors/:id" element={Y(<CounselorBooking />)} />
                <Route path="/youth/payment-result" element={Y(<PaymentResult />)} />
                <Route path="/youth/appointments" element={Y(<YouthAppointments />)} />
                <Route path="/youth/journey" element={Y(<Journey />)} />
                <Route path="/youth/journey/:id" element={Y(<JourneyDetail />)} />
                <Route path="/youth/progress" element={Y(<Progress />)} />
                <Route path="/youth/programs" element={Y(<Programs />)} />
                <Route path="/youth/programs/:id" element={Y(<ProgramDetail />)} />
                <Route path="/youth/privacy" element={Y(<Privacy />)} />
                <Route path="/counselor" element={C(<CounselorHome />)} />
                <Route path="/counselor/appointments" element={C(<CounselorAppointments />)} />
                <Route path="/counselor/clients" element={C(<Clients />)} />
                <Route path="/counselor/clients/:id" element={C(<ClientDetail />)} />
                <Route path="/counselor/availability" element={C(<Availability />)} />
                <Route path="/counselor/profile" element={C(<CounselorProfile />)} />
                <Route path="/counselor/settings" element={C(<CounselorGoogle />)} />
                <Route path="/organization" element={O(<OrgHome />)} />
                <Route path="/organization/programs" element={O(<OrgPrograms />)} />
                <Route path="/organization/programs/:id" element={O(<OrgProgramDetail />)} />
                <Route path="/organization/services" element={O(<OrgServices />)} />
                <Route path="/organization/profile" element={O(<OrgProfile />)} />
                <Route path="/admin" element={A(<AdminHome />)} />
                <Route path="/admin/users" element={A(<AdminUsers />)} />
                <Route path="/admin/verifications" element={A(<AdminVerifications />)} />
                <Route path="/admin/approvals" element={A(<AdminApprovals />)} />
                <Route path="/admin/moderation" element={A(<AdminModeration />)} />
                <Route path="/admin/resources" element={A(<AdminResources />)} />
                <Route path="/admin/assessment" element={A(<AdminAssessment />)} />
                <Route path="/admin/matching" element={A(<AdminMatching />)} />
                <Route path="/admin/payments" element={A(<AdminPayments />)} />
                <Route path="/admin/audit" element={A(<AdminAudit />)} />
                <Route path="/admin/settings" element={A(<AdminSettings />)} />
                <Route path="/admin/jobs" element={A(<AdminJobs />)} />
                <Route path="/admin/blog" element={A(<AdminBlog />)} />
                <Route path="/admin/contact" element={A(<AdminContact />)} />
                <Route path="/community" element={Any(<Community />)} />
                <Route path="/community/mine" element={Any(<MyContent />)} />
                <Route path="/community/:id" element={Any(<CommunityPost />)} />
                <Route path="/resources" element={Any(<Resources />)} />
                <Route path="/notifications" element={Any(<Notifications />)} />
                <Route path="/settings" element={Any(<Settings />)} />
              </Route>
              <Route path="/safety" element={<Suspense fallback={null}><Safety /></Suspense>} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </UiProvider>
    </QueryClientProvider>
  </StrictMode>,
);
