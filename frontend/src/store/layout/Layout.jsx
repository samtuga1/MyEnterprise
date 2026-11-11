import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { Outlet, ScrollRestoration, useLocation } from 'react-router';
import { motion, useReducedMotion } from 'framer-motion';
import Header from './Header.jsx';
import Footer from './Footer.jsx';
import BagDrawer from './BagDrawer.jsx';
import SearchOverlay from './SearchOverlay.jsx';
import { EASE_ENTER } from '../../shared/ui/index.jsx';

const ShellContext = createContext({ openBag: () => {}, openSearch: () => {} });
export const useShell = () => useContext(ShellContext);

export default function Layout() {
  const [bagOpen, setBagOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const location = useLocation();
  const reduce = useReducedMotion();
  const openBag = useCallback(() => setBagOpen(true), []);
  const openSearch = useCallback(() => setSearchOpen(true), []);

  useEffect(() => { setBagOpen(false); setSearchOpen(false); }, [location.pathname]);

  const focusMain = (e) => {
    e.preventDefault();
    const main = document.getElementById('top');
    main?.focus();
    main?.scrollIntoView();
  };

  return (
    <ShellContext.Provider value={{ openBag, openSearch }}>
      <a className="skip-link" href="#top" onClick={focusMain}>Skip to content</a>
      <Header />
      <motion.main id="top" tabIndex={-1} key={location.pathname} className="page"
        initial={reduce ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.36, ease: EASE_ENTER }}>
        <Outlet />
      </motion.main>
      <Footer />
      <BagDrawer open={bagOpen} onClose={() => setBagOpen(false)} />
      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
      <ScrollRestoration />
    </ShellContext.Provider>
  );
}
