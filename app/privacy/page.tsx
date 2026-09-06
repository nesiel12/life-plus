import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/ui/Logo";

// A public, unauthenticated privacy policy — the page Google's OAuth
// consent screen links to, and the one real users read before deciding to
// sign in at all. Deliberately outside middleware's matcher (see
// middleware.ts's config.matcher): nothing here should ever require a
// session, and adding this route there by mistake would 404 the one page
// that specifically must not.
//
// Content mirrors what the app actually does, not generic boilerplate —
// every scope, provider and data category named below is read from the
// real code (lib/auth.ts's GOOGLE_SCOPES, lib/ai/provider.ts's three
// providers, the actual migrated tables), because Google's own review
// process checks a policy's specificity against the app's real OAuth
// scopes, and a generic one is a documented reason apps get bounced.
//
// LAST_UPDATED is a plain string, not new Date() — a policy's effective
// date must only change when its *content* changes, never silently on
// every rebuild.
const LAST_UPDATED = "6 בספטמבר 2026";

// Not a lawyer-drafted document — a plain-language, factually accurate
// description of what this app does, written by inspecting the codebase
// rather than assumed. Treat as a starting point a lawyer should review
// before this app handles real users' health, financial or religious data
// at any real scale.

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="flex flex-col gap-2 border-t border-hairline-card pt-6 first:border-t-0 first:pt-0">
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      <div className="summary-content text-sm text-foreground/85">{children}</div>
    </section>
  );
}

export default function PrivacyPolicyPage() {
  return (
    <main dir="rtl" className="min-h-screen px-6 py-16 sm:px-10 lg:px-16">
      <div className="mx-auto flex max-w-3xl flex-col gap-8">
        <header className="flex flex-col items-center gap-3 text-center">
          <Logo size={48} />
          <h1 className="text-2xl font-bold text-foreground">מדיניות פרטיות — Life Plus</h1>
          <p className="text-xs text-muted">עודכן לאחרונה: {LAST_UPDATED}</p>
        </header>

        <div className="glass-card flex flex-col gap-6 p-6 sm:p-9">
          <Section id="intro" title="מבוא">
            <p>
              Life Plus (״האפליקציה״) היא אפליקציית ניהול חיים אישית. מדיניות זו מסבירה אילו מידע האפליקציה
              אוספת, כיצד הוא נשמר ומשמש, עם מי הוא עשוי להיות משותף, ומה הזכויות שלך לגביו. המדיניות נכתבה
              בהתאם למה שהאפליקציה עושה בפועל, ולא כנוסח כללי — כל שירות צד שלישי, כל הרשאת Google וכל סוג
              מידע המתוארים כאן הם אמיתיים ונבדקו מול הקוד עצמו.
            </p>
            <p>
              אם אינך מסכים לתנאים המתוארים כאן, אל תתחבר לאפליקציה ואל תשתמש בה.
            </p>
          </Section>

          <Section id="account" title="מידע חשבון">
            <p>יצירת חשבון מתבצעת באמצעות התחברות עם Google בלבד — אין הרשמה בסיסמה. בעת ההתחברות הראשונה נשמרים:</p>
            <ul>
              <li>כתובת האימייל, השם ותמונת הפרופיל שמסר חשבון ה-Google שלך.</li>
              <li>מזהה משתמש פנימי, המשמש לקשר בין החשבון לכל המידע שתזין באפליקציה.</li>
            </ul>
            <p>
              האפליקציה אינה מבקשת ואינה שומרת סיסמאות — האימות מתבצע כולו על ידי Google, ו-Life Plus אינו
              רואה ואינו יכול לגשת לסיסמת חשבון ה-Google שלך בשום שלב.
            </p>
          </Section>

          <Section id="google-signin" title="התחברות עם Google וההרשאות המבוקשות">
            <p>ההתחברות מבוססת על Google OAuth ומבקשת את ההרשאות הבאות בלבד, בהתאם לתפקוד בפועל:</p>
            <ul>
              <li>
                <strong>פרופיל בסיסי (openid, profile, email)</strong> — לזיהוי החשבון שלך ויצירת המשתמש
                באפליקציה.
              </li>
              <li>
                <strong>יומן Google (calendar.events)</strong> — הרשאת קריאה <em>וכתיבה</em>, הנדרשת כי
                האפליקציה יוצרת אירועים ביומן שלך בפועל (למשל כשאתה מאשר הצעת זמן), ולא רק קוראת ממנו. אין
                גישה לתיבת הדואר האלקטרוני שלך ולא לשירותי Google אחרים מעבר ליומן.
              </li>
              <li>
                <strong>Google Photos (הרשאה נפרדת, אופציונלית)</strong> — אם תבחר לחבר תמונות מ-Google
                Photos, תתבקש הרשאת קריאה מוגבלת (photospicker.mediaitems.readonly) שאינה חלק מתהליך ההתחברות
                הרגיל. ניתן להשתמש באפליקציה במלואה בלעדיה.
              </li>
            </ul>
            <p>
              טוקן הגישה של Google נשמר בצד השרת בלבד ומעולם אינו נחשף לדפדפן. ניתן לבטל את ההרשאות בכל עת דרך
              הגדרות החשבון של Google בכתובת{" "}
              <span className="ltr" dir="ltr">
                myaccount.google.com/permissions
              </span>
              .
            </p>
          </Section>

          <Section id="data-usage" title="כיצד המידע שלך משמש">
            <p>המידע שאתה מזין באפליקציה — משימות, יעדים, הרגלים, נתונים פיננסיים, ארוחות ואימונים, אנשי קשר ורגעים משפחתיים, סיכומי לימוד ותוכן תורני, ותוכן שיחות עם ה-AI — משמש רק כדי להציג לך את האפליקציה עצמה: להריץ את התכונות שביקשת, לגזור תובנות אישיות (כגון שעות אנרגיה משוערות מתוך צ׳ק-אינים שדיווחת), ולתת מענה בשיחות ה-AI.</p>
            <p>המידע שלך אינו נמכר, ואינו משותף למטרות שיווק או פרסום.</p>
          </Section>

          <Section id="ai-features" title="תכונות מבוססות בינה מלאכותית">
            <p>
              חלק מהתכונות (צ׳אט, בניית מסלולי לימוד, ניתוח פיננסי, סיווג משימות, תמלול הקלטות ועוד) מסתמכות על
              מודלי שפה חיצוניים. כשאתה משתמש בתכונה כזו, החלק הרלוונטי מהבקשה שלך — לרוב הטקסט שכתבת, ולעיתים
              הקשר מהאפליקציה כמו כותרת משימה — נשלח לאחד מהספקים הבאים לצורך עיבוד:
            </p>
            <ul>
              <li>Google Gemini — ספק ה-AI הראשי.</li>
              <li>OpenAI — ספק גיבוי, וכן היחיד המשמש לתמלול הקלטות קול (Whisper).</li>
              <li>Bytez — ספק גיבוי משני, המשמש רק אם שני הספקים האחרים אינם זמינים.</li>
            </ul>
            <p>
              כל ספק מקבל רק את התוכן הדרוש לבקשה הספציפית, ולא גישה מתמשכת לחשבון שלך. לשימוש בכל ספק חלה
              מדיניות הפרטיות שלו. שימוש בתכונות ה-AI כפוף למכסה חינמית יומית, המנוהלת בשרת ואינה חושפת מידע
              נוסף לספקים אלו.
            </p>
          </Section>

          <Section id="storage" title="אחסון ואבטחת מידע">
            <p>
              המידע שלך מאוחסן במסד נתונים מנוהל של Supabase, והאפליקציה עצמה רצה על תשתית Vercel. התקשורת בין
              הדפדפן שלך לשרת מוצפנת (HTTPS). מפתחות ה-API של כל שירות חיצוני נשמרים בצד השרת בלבד ואינם נחשפים
              לדפדפן בשום שלב.
            </p>
            <p>
              הגישה למסד הנתונים מוגבלת בקוד היישום כך שכל שאילתה מסוננת למשתמש המחובר בלבד — חשבון אחד אינו
              יכול לראות מידע של חשבון אחר.
            </p>
          </Section>

          <Section id="third-parties" title="שירותי צד שלישי">
            <p>מעבר לספקי ה-AI שלעיל, האפליקציה עשויה להשתמש בשירותים הבאים בהתאם לתכונות שתפעיל:</p>
            <ul>
              <li>Google — התחברות, יומן, ובאופן אופציונלי תמונות.</li>
              <li>Resend — לשליחת התראות בדוא״ל, אם תבחר לאפשר ערוץ זה.</li>
              <li>WhatsApp Business API — לשליחת התראות ב-WhatsApp, אם תבחר לאפשר ערוץ זה ותמסור מספר טלפון.</li>
            </ul>
            <p>ערוצי ההתראות אופציונליים ואינם פעילים כברירת מחדל.</p>
          </Section>

          <Section id="rights" title="הזכויות שלך">
            <ul>
              <li>
                <strong>גישה ותיקון</strong> — ניתן לצפות ולערוך את רוב המידע שלך ישירות באפליקציה.
              </li>
              <li>
                <strong>מחיקה</strong> — אין כרגע כפתור עצמאי למחיקת חשבון באפליקציה עצמה. לבקשת מחיקה מלאה של
                חשבונך וכל המידע המקושר אליו, פנה לכתובת בסעיף ״יצירת קשר״ למטה — הבקשה תטופל בזמן סביר.
              </li>
              <li>
                <strong>ביטול הרשאות Google</strong> — ניתן בכל עת דרך הגדרות חשבון ה-Google שלך, ללא צורך
                בפנייה אלינו.
              </li>
            </ul>
          </Section>

          <Section id="changes" title="שינויים במדיניות">
            <p>
              מדיניות זו עשויה להתעדכן מעת לעת. תאריך העדכון האחרון מופיע בראש העמוד. שינויים מהותיים יובאו
              לידיעתך באפליקציה עצמה.
            </p>
          </Section>

          <Section id="contact" title="יצירת קשר">
            <p>
              לשאלות, בקשות מחיקת מידע או פניות בנוגע לפרטיות, ניתן לפנות אלינו בכתובת:{" "}
              <a
                href="mailto:nesiel12388@gmail.com"
                className="ltr font-medium text-gold-ink underline-offset-2 hover:underline"
                dir="ltr"
              >
                nesiel12388@gmail.com
              </a>
              .
            </p>
          </Section>
        </div>

        <p className="text-center text-xs text-muted">
          <Link href="/login" className="focus-ring rounded transition-colors hover:text-gold-ink">
            חזרה להתחברות
          </Link>
        </p>
      </div>
    </main>
  );
}
