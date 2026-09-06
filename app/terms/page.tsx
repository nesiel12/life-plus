import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/ui/Logo";

// A public, unauthenticated Terms of Service — the page Google's OAuth
// consent screen links to alongside /privacy. Deliberately outside
// middleware.ts's matcher, for the same reason /privacy is: nothing here
// should ever require a session.
//
// Content mirrors what the app actually does, not a generic template —
// every feature, provider and limitation named below matches the real
// code (lib/ai/provider.ts's three providers, lib/ai/quota.ts's free-only
// model, the actual absence of a self-service delete-account flow), so
// this reads honestly rather than promising something the app doesn't do.
//
// The Section helper duplicates app/privacy/page.tsx's local component
// rather than sharing one — deliberately: extracting a shared component
// would mean touching that file too, and this page was asked for without
// touching anything unrelated.
const LAST_UPDATED = "7 בספטמבר 2026";

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

export default function TermsOfServicePage() {
  return (
    <main dir="rtl" className="min-h-screen px-6 py-16 sm:px-10 lg:px-16">
      <div className="mx-auto flex max-w-3xl flex-col gap-8">
        <header className="flex flex-col items-center gap-3 text-center">
          <Logo size={48} />
          <h1 className="text-2xl font-bold text-foreground">תנאי שימוש — Life Plus</h1>
          <p className="text-xs text-muted">עודכן לאחרונה: {LAST_UPDATED}</p>
        </header>

        <div className="glass-card flex flex-col gap-6 p-6 sm:p-9">
          <Section id="intro" title="מבוא והסכמה לתנאים">
            <p>
              תנאי שימוש אלה (״התנאים״) חלים על השימוש באפליקציית Life Plus (״האפליקציה״). בהתחברות
              לאפליקציה ובשימוש בה, הנך מסכים לתנאים אלה במלואם. אם אינך מסכים לתנאי מהם, אל תתחבר ואל תשתמש
              באפליקציה.
            </p>
            <p>
              האפליקציה מנוהלת על ידי מפתח יחיד כפרויקט אישי, ולא על ידי חברה. מסמך זה נכתב בהתאם למה
              שהאפליקציה עושה בפועל — לא כנוסח גנרי — ומפרט להלן היכן הדבר משנה את המשמעות המעשית של תנאי
              מסוים.
            </p>
          </Section>

          <Section id="accounts" title="חשבון משתמש">
            <p>
              ההתחברות לאפליקציה מתבצעת אך ורק באמצעות חשבון Google (ראו גם ״התחברות עם Google״ למטה). אין
              הרשמה בסיסמה נפרדת, ואין אימות גיל טכני באפליקציה — השימוש מיועד למי שכשיר משפטית להתקשר בתנאים
              אלה, ובאחריותך לוודא זאת לפני ההתחברות.
            </p>
            <p>
              אתה אחראי לפעילות המתבצעת בחשבונך. אין כרגע תכונה עצמאית למחיקת חשבון בתוך האפליקציה עצמה — בקשת
              מחיקה מלאה של החשבון ושל כל המידע המקושר אליו מתבצעת בפנייה לכתובת שבסעיף ״יצירת קשר״, כמפורט
              גם במדיניות הפרטיות.
            </p>
          </Section>

          <Section id="google-signin" title="התחברות עם Google ואינטגרציות Google אופציונליות">
            <p>
              ההתחברות מתבצעת דרך Google OAuth ומבקשת פרופיל בסיסי (שם, אימייל, תמונה) והרשאת גישה ליומן
              Google שלך (קריאה וכתיבה) — הנדרשת בפועל, מכיוון שהאפליקציה יוצרת אירועים אמיתיים ביומנך כאשר
              אתה מאשר הצעת זמן. פירוט מלא של ההרשאות מופיע במדיניות הפרטיות.
            </p>
            <p>
              חיבור Google Photos הוא תכונה נפרדת ואופציונלית לחלוטין, המבוססת על הרשאה מוגבלת משלה. ניתן
              להשתמש באפליקציה במלואה בלעדיה, וניתן לבטל כל הרשאת Google בכל עת דרך הגדרות חשבון ה-Google
              שלך, ללא תלות באפליקציה.
            </p>
          </Section>

          <Section id="ai-features" title="תכונות מבוססות בינה מלאכותית">
            <p>
              האפליקציה כוללת תכונות המסתמכות על מודלי שפה חיצוניים (Google Gemini כספק ראשי, OpenAI כגיבוי
              וכן לתמלול הקלטות קול, ו-Bytez כגיבוי משני) — לדוגמה צ׳אט, בניית מסלולי לימוד, ניתוח פיננסי,
              המלצות תזונה, וסיווג משימות. השימוש בתכונות אלה כפוף למכסה חינמית יומית; אין באפליקציה כרגע כל
              מסלול תשלום, מנוי או רכישת מכסה נוספת.
            </p>
            <p>
              <strong>תוכן שנוצר על ידי בינה מלאכותית עלול לכלול טעויות.</strong> באחריותך לבחון כל תוכן כזה
              לפני הסתמכות עליו — במיוחד תוכן בתחומי פיננסים, בריאות ותזונה, או לימוד תורני. תוכן זה אינו
              מהווה ייעוץ פיננסי, רפואי, תזונתי, הלכתי או משפטי מקצועי, ואינו תחליף לייעוץ כאמור מגורם מוסמך.
            </p>
          </Section>

          <Section id="user-content" title="תוכן שאתה מזין — כולל מידע על אנשים אחרים">
            <p>
              התוכן שאתה מזין (משימות, יעדים, נתונים פיננסיים, סיכומים, ותוכן שיחות) נשאר בבעלותך. האפליקציה
              משתמשת בו רק כדי להפעיל את התכונות שביקשת, כמפורט במדיניות הפרטיות.
            </p>
            <p>
              חלק מהתכונות מאפשרות לתעד מידע על אנשים אחרים — למשל אנשי קשר, בני משפחה ורגעים משותפים איתם.
              באחריותך הבלעדית לוודא שיש לך בסיס חוקי ולגיטימי לתיעוד מידע כזה, ולהשתמש בו בהתחשבות בפרטיות
              אותם אנשים.
            </p>
          </Section>

          <Section id="acceptable-use" title="שימוש מקובל">
            <p>בשימוש באפליקציה, הנך מתחייב שלא:</p>
            <ul>
              <li>לעשות שימוש באפליקציה למטרה בלתי חוקית או תוך הפרת זכויות צד שלישי.</li>
              <li>
                לנסות לעקוף את מנגנוני האבטחה, המכסות החינמיות, או ההגבלות הטכניות של האפליקציה, לרבות ניסיון
                לגשת למידע של משתמשים אחרים.
              </li>
              <li>להעמיס על האפליקציה או על ספקי צד שלישי המחוברים אליה (למשל דרך שימוש אוטומטי/בוטי).</li>
              <li>להזין תוכן פוגעני, מטעה, או המפר זכויות יוצרים או פרטיות של אחרים.</li>
            </ul>
          </Section>

          <Section id="third-parties" title="שירותי צד שלישי">
            <p>
              האפליקציה פועלת בהסתמך על שירותי צד שלישי — Google (התחברות, יומן, ותמונות באופן אופציונלי),
              Google Gemini, OpenAI ו-Bytez (עיבוד AI), Supabase (מסד נתונים), Vercel (אחסון האפליקציה),
              ובאופן אופציונלי Resend (דוא״ל) ו-WhatsApp Business API (התראות). זמינות ותפקוד האפליקציה
              תלויים בזמינות שירותים אלה, ואין לנו שליטה על מדיניותם או על הפסקת פעילותם.
            </p>
          </Section>

          <Section id="availability" title="זמינות השירות">
            <p>
              Life Plus הוא פרויקט אישי בקנה מידה קטן, ואינו מספק התחייבות לזמינות רציפה (SLA). ייתכנו
              הפסקות, תקלות, שינויים בתכונות, או הפסקת תכונה או של השירות כולו, לרבות ללא הודעה מראש. אין
              באפליקציה גיבוי אוטומטי כלפי המשתמש מעבר לאחסון הרגיל במסד הנתונים.
            </p>
          </Section>

          <Section id="liability" title="הגבלת אחריות">
            <p>
              האפליקציה ניתנת לשימוש ״כפי שהיא״ (AS IS), ללא כל אחריות מפורשת או משתמעת, לרבות אחריות לדיוק,
              אמינות, או התאמה למטרה מסוימת. במידה המרבית המותרת בחוק, לא תישא האפליקציה או מפתחה באחריות
              לנזק ישיר או עקיף שייגרם משימוש באפליקציה, מהסתמכות על תוכן שנוצר על ידי בינה מלאכותית, או מאובדן
              מידע.
            </p>
          </Section>

          <Section id="ip" title="קניין רוחני">
            <p>
              עיצוב האפליקציה, הלוגו, הקוד והמותג שייכים למפתח האפליקציה. אין להעתיק, להנדס לאחור, או להפיץ
              מחדש חלקים מהאפליקציה ללא הרשאה. תוכן שאתה יוצר באפליקציה (כולל באמצעות תכונות ה-AI) נשאר
              בבעלותך, בכפוף לתנאי השימוש של ספקי ה-AI החיצוניים המעבדים אותו.
            </p>
          </Section>

          <Section id="termination" title="הפסקת שימוש">
            <p>
              באפשרותך להפסיק את השימוש באפליקציה בכל עת, פשוט על ידי הפסקת ההתחברות אליה וביטול הרשאות
              Google הרלוונטיות. אנו רשאים להשעות או לסגור חשבון במקרה של הפרת תנאים אלה, לרבות שימוש לרעה
              בתכונות ה-AI או ניסיון פגיעה באבטחת האפליקציה.
            </p>
          </Section>

          <Section id="changes" title="שינויים בתנאים">
            <p>
              תנאים אלה עשויים להתעדכן מעת לעת. תאריך העדכון האחרון מופיע בראש העמוד. המשך שימוש באפליקציה
              לאחר עדכון מהווה הסכמה לתנאים המעודכנים.
            </p>
          </Section>

          <Section id="governing-law" title="דין חל">
            <p>
              תנאים אלה כפופים לדיני מדינת ישראל, ללא מתן תוקף לכללי ברירת הדין הבינלאומי. לבתי המשפט
              המוסמכים במדינת ישראל תהא סמכות שיפוט ייחודית בכל מחלוקת הנובעת מתנאים אלה או הקשורה אליהם.
            </p>
          </Section>

          <Section id="contact" title="יצירת קשר">
            <p>
              לשאלות בנוגע לתנאים אלה, ניתן לפנות אלינו בכתובת:{" "}
              <a
                href="mailto:nesiel12388@gmail.com"
                className="ltr font-medium text-gold-ink underline-offset-2 hover:underline"
                dir="ltr"
              >
                nesiel12388@gmail.com
              </a>
              . לשאלות בנוגע לפרטיות ולמידע שנאסף, ראו את{" "}
              <Link href="/privacy" className="font-medium text-gold-ink underline-offset-2 hover:underline">
                מדיניות הפרטיות
              </Link>
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
