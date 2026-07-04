import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { PreviewSoundProvider } from "@/contexts/PreviewSoundContext";

const Index = lazy(() => import("./pages/Index"));
const Auth = lazy(() => import("./pages/Auth"));
const Profile = lazy(() => import("./pages/Profile"));
const MyList = lazy(() => import("./pages/MyList"));
const Admin = lazy(() => import("./pages/Admin"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Import = lazy(() => import("./pages/Import"));
const Watch = lazy(() => import("./pages/Watch"));
const Videos = lazy(() => import("./pages/Videos"));
const Models = lazy(() => import("./pages/Models"));
const VideoDetail = lazy(() => import("./pages/VideoDetail"));
const Playlists = lazy(() => import("./pages/Playlists"));
const OAuthConsent = lazy(() => import("./pages/OAuthConsent"));

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <ThemeProvider>
        <PreviewSoundProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Suspense fallback={null}>
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/auth" element={<Auth />} />
                <Route path="/profile" element={<Profile />} />
                <Route path="/my-list" element={<MyList />} />
                <Route path="/admin" element={<Admin />} />
                <Route path="/import" element={<Import />} />
                <Route path="/watch" element={<Watch />} />
                <Route path="/videos" element={<Videos />} />
                <Route path="/video/:id" element={<VideoDetail />} />
                <Route path="/models" element={<Models />} />
                <Route path="/playlists" element={<Playlists />} />
                <Route path="/.lovable/oauth/consent" element={<OAuthConsent />} />
                {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </PreviewSoundProvider>
        </ThemeProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
