import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  BookOpen, Settings2, PlusCircle, LayoutDashboard, Trophy,
  Menu, X, Shuffle, GraduationCap, ChevronRight, Bell, Search
} from "lucide-react";
import { MainMenu } from "./components/MainMenu";
import { AdvancedQuiz } from "./components/AdvancedQuiz";
import { CustomQuiz } from "./components/CustomQuiz";
import { Dashboard } from "./components/Dashboard";
import { Achievements } from "./components/Achievements";
import { QuizView } from "./components/QuizView";
import { getQuestionsForQuiz, type QuizQuestion } from "./components/questionBank";

type Section = "home" | "advanced" | "custom" | "dashboard" | "achievements";

interface NavItem {
  id: Section;
  label: string;
  icon: typeof BookOpen;
  description: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: "home", label: "Basic Quizzes", icon: BookOpen, description: "10 questions, pick & go" },
  { id: "advanced", label: "Advanced", icon: Settings2, description: "Custom topics & difficulty" },
  { id: "custom", label: "Create Quiz", icon: PlusCircle, description: "Build your own quizzes" },
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, description: "Stats & history" },
  { id: "achievements", label: "Achievements", icon: Trophy, description: "Badges & rewards" },
];

interface ActiveQuiz {
  questions: QuizQuestion[];
  subjectId: string;
  difficulty: string;
  questionCount: number;
  sourceSection: Section;
}

interface ToastState {
  visible: boolean;
  message: string;
  sub?: string;
}

export default function App() {
  const [activeSection, setActiveSection] = useState<Section>("home");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeQuiz, setActiveQuiz] = useState<ActiveQuiz | null>(null);
  const [toast, setToast] = useState<ToastState>({ visible: false, message: "" });

  const showToast = (message: string, sub?: string) => {
    setToast({ visible: true, message, sub });
    setTimeout(() => setToast(t => ({ ...t, visible: false })), 3000);
  };

  const navigate = (section: Section) => {
    setActiveSection(section);
    setSidebarOpen(false);
  };

  const handleStartQuiz = (selection: {
    subjectId: string;
    difficulty?: string;
    subtopics?: string[];
    questionCount?: number;
  }) => {
    const difficulty = selection.difficulty || "medium";
    const count = selection.questionCount || 10;
    const questions = getQuestionsForQuiz(selection.subjectId, count, selection.subtopics);
    setActiveQuiz({
      questions,
      subjectId: selection.subjectId,
      difficulty,
      questionCount: count,
      sourceSection: activeSection,
    });
  };

  const handleQuizBack = () => {
    setActiveQuiz(null);
  };

  const handleQuizRetry = () => {
    if (!activeQuiz) return;
    const questions = getQuestionsForQuiz(activeQuiz.subjectId, activeQuiz.questionCount);
    setActiveQuiz({ ...activeQuiz, questions });
  };

  const handleSaveQuiz = (quiz: { title: string; questions: unknown[] }) => {
    showToast("Quiz Saved!", `"${quiz.title || "Untitled Quiz"}" · ${quiz.questions.length} questions`);
  };

  const handleRandomQuiz = () => {
    const subjects = ["mathematics", "physics", "history", "geography", "computer_science", "biology", "chemistry", "literature"];
    const diffs = ["easy", "medium", "hard"];
    const subjectId = subjects[Math.floor(Math.random() * subjects.length)];
    const difficulty = diffs[Math.floor(Math.random() * diffs.length)];
    handleStartQuiz({ subjectId, difficulty, questionCount: 10 });
  };

  const activeNav = NAV_ITEMS.find(n => n.id === activeSection)!;

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Mobile overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            key="overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSidebarOpen(false)}
            className="fixed inset-0 bg-black/40 z-20 lg:hidden"
          />
        )}
      </AnimatePresence>

      {/* Sidebar — fixed on mobile, static on desktop */}
      <aside
        className={`
          fixed top-0 left-0 bottom-0 z-30 w-72
          lg:static lg:z-auto lg:flex lg:shrink-0
          flex flex-col bg-card border-r border-border
          transition-transform duration-300 ease-in-out
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
        `}
      >
        <SidebarContent
          activeSection={activeSection}
          onNavigate={navigate}
          onClose={() => setSidebarOpen(false)}
          onRandomQuiz={handleRandomQuiz}
        />
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Topbar */}
        <header className="flex items-center gap-3 px-5 py-3.5 border-b border-border bg-card shrink-0">
          {/* Hamburger — mobile only */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden p-2 rounded-xl hover:bg-accent transition-colors cursor-pointer"
            aria-label="Open menu"
          >
            <Menu size={20} className="text-muted-foreground" />
          </button>

          {/* Breadcrumb */}
          {activeQuiz ? (
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <GraduationCap size={14} />
              <span>Learning Curve</span>
              <ChevronRight size={13} />
              <span className="text-foreground">Quiz in progress</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <GraduationCap size={14} />
              <span>Learning Curve</span>
              <ChevronRight size={13} />
              <span className="text-foreground">{activeNav.label}</span>
            </div>
          )}

          <div className="ml-auto flex items-center gap-2">
            <div className="relative hidden sm:flex items-center">
              <Search size={14} className="absolute left-3 text-muted-foreground pointer-events-none" />
              <input
                placeholder="Search..."
                className="pl-9 pr-4 py-2 rounded-xl border border-border bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#4f46e5]/30 focus:border-[#4f46e5] transition-all w-44"
              />
            </div>
            <button className="relative p-2 rounded-xl hover:bg-accent transition-colors cursor-pointer" aria-label="Notifications">
              <Bell size={17} className="text-muted-foreground" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#4f46e5]" />
            </button>
            <button
              onClick={() => navigate("dashboard")}
              className="w-8 h-8 rounded-full bg-gradient-to-br from-[#4f46e5] to-[#7c3aed] flex items-center justify-center text-white text-xs font-medium select-none cursor-pointer"
            >
              AJ
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-6xl mx-auto px-5 py-8">
            <AnimatePresence mode="wait">
              {activeQuiz ? (
                <motion.div
                  key="quiz"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.18 }}
                >
                  <QuizView
                    questions={activeQuiz.questions}
                    subjectId={activeQuiz.subjectId}
                    difficulty={activeQuiz.difficulty}
                    questionCount={activeQuiz.questionCount}
                    onBack={handleQuizBack}
                    onRetry={handleQuizRetry}
                  />
                </motion.div>
              ) : (
                <motion.div
                  key={activeSection}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.18 }}
                >
                  {activeSection === "home" && (
                    <MainMenu onStartQuiz={handleStartQuiz} />
                  )}
                  {activeSection === "advanced" && (
                    <AdvancedQuiz onStartQuiz={handleStartQuiz} />
                  )}
                  {activeSection === "custom" && (
                    <CustomQuiz onSave={handleSaveQuiz} />
                  )}
                  {activeSection === "dashboard" && (
                    <Dashboard onNavigate={(s) => navigate(s as Section)} />
                  )}
                  {activeSection === "achievements" && (
                    <Achievements />
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </main>
      </div>

      {/* Toast notification */}
      <AnimatePresence>
        {toast.visible && (
          <motion.div
            key="toast"
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3.5 rounded-2xl bg-foreground text-background shadow-2xl"
          >
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
            <div>
              <p className="text-sm font-medium leading-none">{toast.message}</p>
              {toast.sub && <p className="text-xs opacity-60 mt-0.5">{toast.sub}</p>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface SidebarContentProps {
  activeSection: Section;
  onNavigate: (s: Section) => void;
  onClose: () => void;
  onRandomQuiz: () => void;
}

function SidebarContent({ activeSection, onNavigate, onClose, onRandomQuiz }: SidebarContentProps) {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Logo */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-[#4f46e5] to-[#7c3aed] shrink-0">
            <GraduationCap size={18} className="text-white" />
          </div>
          <div>
            <p className="font-semibold text-foreground leading-none">Learning Curve</p>
            <p className="text-xs text-muted-foreground mt-0.5">Knowledge Platform</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="lg:hidden p-1.5 rounded-lg hover:bg-accent transition-colors cursor-pointer"
          aria-label="Close menu"
        >
          <X size={16} className="text-muted-foreground" />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 flex flex-col gap-1 overflow-y-auto">
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider px-3 mb-2">
          Menu
        </p>

        {NAV_ITEMS.map(item => {
          const Icon = item.icon;
          const isActive = activeSection === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all w-full cursor-pointer group ${
                isActive
                  ? "bg-[#eef2ff] text-[#4f46e5]"
                  : "text-foreground hover:bg-accent"
              }`}
            >
              <div className={`flex items-center justify-center w-8 h-8 rounded-lg transition-all shrink-0 ${
                isActive
                  ? "bg-[#4f46e5] text-white"
                  : "bg-muted text-muted-foreground"
              }`}>
                <Icon size={16} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium leading-none truncate">{item.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">{item.description}</p>
              </div>
              {isActive && (
                <div className="w-1.5 h-1.5 rounded-full bg-[#4f46e5] shrink-0" />
              )}
            </button>
          );
        })}

        <div className="mt-4 pt-4 border-t border-border">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider px-3 mb-2">
            Quick Actions
          </p>
          <button
            onClick={onRandomQuiz}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-foreground hover:bg-accent transition-all w-full cursor-pointer"
          >
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-muted text-muted-foreground shrink-0">
              <Shuffle size={16} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium leading-none">Random Quiz</p>
              <p className="text-xs text-muted-foreground mt-0.5">Surprise me!</p>
            </div>
          </button>
        </div>
      </nav>

      {/* User card */}
      <div className="px-3 py-4 border-t border-border shrink-0">
        <button
          onClick={() => onNavigate("dashboard")}
          className="flex items-center gap-3 w-full p-3 rounded-xl hover:bg-accent transition-colors cursor-pointer"
        >
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#4f46e5] to-[#7c3aed] flex items-center justify-center text-white text-sm font-medium shrink-0 select-none">
            AJ
          </div>
          <div className="flex-1 min-w-0 text-left">
            <p className="text-sm font-medium text-foreground leading-none truncate">Alex Johnson</p>
            <p className="text-xs text-muted-foreground mt-0.5">Level 12 · 2,450 XP</p>
          </div>
          <div className="px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 shrink-0">
            <span className="text-amber-600 text-xs font-medium">Lv.12</span>
          </div>
        </button>
      </div>
    </div>
  );
}
