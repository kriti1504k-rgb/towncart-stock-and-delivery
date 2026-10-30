import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

// Simple Hindi / English switch for the admin screens.
// How it works: screens call t('English text'). If a Hindi version exists below, it is shown
// when Hindi is selected; otherwise the English text is shown. To translate a new label,
// just add one line to the `hi` list below: 'English text': 'हिंदी टेक्स्ट',
export type Lang = 'en' | 'hi';
const STORAGE_KEY = 'admin-language';

const hi: Record<string, string> = {
  // Menu and page titles
  Dashboard: 'डैशबोर्ड', Products: 'प्रोडक्ट', Categories: 'कैटेगरी', Orders: 'ऑर्डर', Customers: 'ग्राहक',
  products: 'प्रोडक्ट', categories: 'कैटेगरी', orders: 'ऑर्डर', customers: 'ग्राहक',
  'Store management': 'दुकान का प्रबंधन', Admin: 'एडमिन', 'Customer shop': 'ग्राहक की दुकान', 'View shop': 'दुकान देखें',
  'Sign out': 'लॉग आउट', 'Refresh shop data': 'डेटा रिफ्रेश करें', Search: 'खोजें',
  // Access screens
  'Checking admin access…': 'एडमिन एक्सेस जाँच रहे हैं…', 'Admin panel could not load': 'एडमिन पैनल नहीं खुल पाया',
  'Try again': 'फिर कोशिश करें', 'Access denied': 'प्रवेश नहीं मिला',
  'This account does not have admin access.': 'इस अकाउंट के पास एडमिन अधिकार नहीं है।', 'Return to shop': 'दुकान पर वापस जाएं',
  'Alternate phone': 'दूसरा फोन नंबर', 'Call alternate number': 'दूसरे नंबर पर कॉल करें', 'Open location in Maps': 'मैप में लोकेशन खोलें',
  // Dashboard
  "Today's new orders": 'आज के नए ऑर्डर', 'Pending orders': 'बाकी ऑर्डर', 'Total orders': 'कुल ऑर्डर', 'Sales this week': 'इस हफ्ते की बिक्री',
  'Latest orders': 'नए ऑर्डर', 'View all': 'सब देखें',
  'This week: Monday–Sunday, India time. Cancelled orders excluded from sales.': 'इस हफ्ते: सोमवार–रविवार, भारतीय समय। रद्द ऑर्डर बिक्री में नहीं गिने गए।',
  // Orders
  'Order / customer': 'ऑर्डर / ग्राहक', Placed: 'समय', Total: 'कुल', Status: 'स्थिति', Open: 'खोलें', NEW: 'नया', Customer: 'ग्राहक',
  'No orders found.': 'कोई ऑर्डर नहीं मिला।', All: 'सभी', Order: 'ऑर्डर',
  Received: 'मिला', Confirmed: 'पक्का हुआ', Dispatched: 'भेज दिया', Delivered: 'पहुँच गया', Cancelled: 'रद्द',
  'Order status updated': 'ऑर्डर की स्थिति बदल गई', 'Order status could not be changed': 'ऑर्डर की स्थिति नहीं बदल पाई',
  'Call customer': 'ग्राहक को कॉल करें', 'WhatsApp customer': 'ग्राहक को WhatsApp करें', 'Order note': 'ऑर्डर नोट',
  'Cash or UPI on delivery': 'डिलीवरी पर नकद या UPI', 'Change status': 'स्थिति बदलें',
  // Categories
  'Add category': 'कैटेगरी जोड़ें', 'Rename category': 'कैटेगरी का नाम बदलें', 'Delete category': 'कैटेगरी हटाएं',
  'Category name': 'कैटेगरी का नाम', 'Save category': 'कैटेगरी सेव करें', 'Category saved': 'कैटेगरी सेव हो गई',
  'No categories yet.': 'अभी कोई कैटेगरी नहीं है।', 'Category could not be saved': 'कैटेगरी सेव नहीं हो पाई',
  'Enter a category name, up to 100 characters': 'कैटेगरी का नाम लिखें (100 अक्षर तक)',
  'Could not add category': 'कैटेगरी नहीं जुड़ पाई', 'Enter a category name': 'कैटेगरी का नाम लिखें',
  // Customers
  Name: 'नाम', Phone: 'फोन', Address: 'पता', 'No customers yet.': 'अभी कोई ग्राहक नहीं है।',
  // Product form
  'Add product': 'प्रोडक्ट जोड़ें', 'Edit product': 'प्रोडक्ट बदलें', 'Product details and availability': 'प्रोडक्ट की जानकारी और उपलब्धता',
  Unit: 'यूनिट', 'e.g. 5 kg bag': 'जैसे 5 किलो की बोरी', 'Price (₹)': 'कीमत (₹)', Category: 'कैटेगरी', Description: 'विवरण',
  'Product image': 'प्रोडक्ट की फोटो', 'JPG, PNG or WebP · Up to 5 MB': 'JPG, PNG या WebP · 5 MB तक', 'Opening stock': 'शुरुआती स्टॉक',
  'Low stock alert below': 'कम स्टॉक की चेतावनी', 'Save product': 'प्रोडक्ट सेव करें', 'Product saved': 'प्रोडक्ट सेव हो गया',
  Uncategorized: 'बिना कैटेगरी', 'Saving…': 'सेव हो रहा है…', 'Check product details': 'प्रोडक्ट की जानकारी जाँचें',
  'Product could not be saved. Check your admin access.': 'प्रोडक्ट सेव नहीं हो पाया। अपना एडमिन एक्सेस जाँचें।',
  'Product could not be saved': 'प्रोडक्ट सेव नहीं हो पाया',
  'Choose a JPG, PNG or WebP image under 5 MB': '5 MB से छोटी JPG, PNG या WebP फोटो चुनें',
  'Choose a JPG, PNG or WebP under 5 MB': '5 MB से छोटी JPG, PNG या WebP फोटो चुनें',
  'Image upload failed. Please try again.': 'फोटो अपलोड नहीं हुई। फिर कोशिश करें।', 'Image upload failed': 'फोटो अपलोड नहीं हुई',
  'Stock and alert level must be nonnegative whole numbers': 'स्टॉक और चेतावनी की संख्या पूरी संख्या होनी चाहिए (0 या ज़्यादा)',
  // Delete
  Delete: 'हटाएं', 'Deleting…': 'हटा रहे हैं…', Cancel: 'रद्द करें', Deleted: 'हटा दिया',
  'Products in this category will become uncategorized.': 'इस कैटेगरी के प्रोडक्ट "बिना कैटेगरी" में चले जाएंगे।',
  'This product will be removed from the shop. Past orders will keep their item details.': 'यह प्रोडक्ट दुकान से हट जाएगा। पुराने ऑर्डर में इसकी जानकारी बनी रहेगी।',
  'Could not delete this item': 'यह हटाया नहीं जा सका', 'Delete product': 'प्रोडक्ट हटाएं',
  'Change could not be saved. Please try again.': 'बदलाव सेव नहीं हो पाया। फिर कोशिश करें।',
  // Stock table
  'Search products…': 'प्रोडक्ट खोजें…', 'All categories': 'सभी कैटेगरी', 'Add new product': 'नया प्रोडक्ट जोड़ें',
  'low stock': 'कम स्टॉक', 'All changes saved': 'सारे बदलाव सेव हो गए',
  Image: 'फोटो', 'Product name': 'प्रोडक्ट का नाम', 'Stock quantity': 'स्टॉक (कितना बचा है)', Actions: 'क्रिया',
  'Out of stock': 'स्टॉक खत्म', 'Low stock': 'कम स्टॉक', Available: 'उपलब्ध', 'Alert below': 'चेतावनी इससे कम पर',
  'Sold offline': 'दुकान पर बिका', 'Add stock': 'स्टॉक जोड़ें', History: 'हिसाब', 'No products found': 'कोई प्रोडक्ट नहीं मिला',
  '+ Add category': '+ कैटेगरी जोड़ें', 'currently in stock': 'अभी स्टॉक में', Quantity: 'मात्रा', 'Confirm stock change': 'स्टॉक बदलाव पक्का करें',
  'Enter a positive whole quantity': 'पूरी संख्या में मात्रा लिखें (0 से ज़्यादा)', 'Could not save. Try again.': 'सेव नहीं हो पाया। फिर कोशिश करें।',
  // History
  'Stock history': 'स्टॉक का हिसाब', 'Loading history…': 'हिसाब लोड हो रहा है…', 'Retry history': 'हिसाब फिर लोड करें',
  'No stock changes yet.': 'अभी स्टॉक में कोई बदलाव नहीं हुआ।', remaining: 'बचा',
  'online order': 'वेबसाइट का ऑर्डर', 'offline sale': 'दुकान पर बिक्री', 'stock added': 'स्टॉक जोड़ा', 'manual correction': 'हाथ से सुधार', 'order cancelled': 'ऑर्डर रद्द',
  // Admin login
  'Admin login': 'एडमिन लॉगिन', 'Admin phone number': 'एडमिन का फोन नंबर', Password: 'पासवर्ड', 'Logging in…': 'लॉग इन हो रहा है…',
  'Show password': 'पासवर्ड दिखाएं', 'Hide password': 'पासवर्ड छुपाएं', 'Could not log in:': 'लॉग इन नहीं हो पाया:',
  'This account is not confirmed yet. Confirm it in Supabase.': 'यह अकाउंट अभी कन्फ़र्म नहीं है। इसे Supabase में कन्फ़र्म करें।',
  'Enter a 10-digit phone number': '10 अंकों का फोन नंबर लिखें', 'Wrong phone number or password': 'फोन नंबर या पासवर्ड गलत है',
  'This account does not have admin access': 'इस अकाउंट के पास एडमिन अधिकार नहीं है', 'Unable to log in. Please try again.': 'लॉग इन नहीं हो पाया। फिर कोशिश करें।',
};

type Ctx = { lang: Lang; setLang: (l: Lang) => void; t: (text: string) => string };
const LangContext = createContext<Ctx>({ lang: 'en', setLang: () => {}, t: s => s });

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>('en');
  // Read the saved choice after the page loads, so the server and browser pages match.
  useEffect(() => {
    try { const saved = localStorage.getItem(STORAGE_KEY); if (saved === 'hi' || saved === 'en') setLangState(saved); } catch { /* storage unavailable */ }
  }, []);
  const setLang = (l: Lang) => {
    setLangState(l);
    try { localStorage.setItem(STORAGE_KEY, l); } catch { /* storage unavailable */ }
  };
  const t = (text: string) => (lang === 'hi' ? hi[text] ?? text : text);
  return <LangContext.Provider value={{ lang, setLang, t }}>{children}</LangContext.Provider>;
}

export const useT = () => useContext(LangContext);

export function LanguageToggle() {
  const { lang, setLang } = useT();
  const base = 'px-3 py-1.5 text-sm font-semibold transition-colors';
  return (
    <div role="group" aria-label="Language / भाषा" className="flex overflow-hidden rounded-md border">
      <button type="button" aria-pressed={lang === 'hi'} onClick={() => setLang('hi')} className={`${base} ${lang === 'hi' ? 'bg-primary text-primary-foreground' : 'bg-surface text-foreground'}`}>हिंदी</button>
      <button type="button" aria-pressed={lang === 'en'} onClick={() => setLang('en')} className={`${base} ${lang === 'en' ? 'bg-primary text-primary-foreground' : 'bg-surface text-foreground'}`}>English</button>
    </div>
  );
}
