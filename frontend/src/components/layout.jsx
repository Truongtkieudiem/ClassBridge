import Header from "./header";
import Footer from "./footer";
import "./layout.css";

export default function Layout({ user, children }) {
  const role = user?.role || "guest";

  return (
    <div className={`app-layout app-layout--${role}`}>
      <Header user={user} />
      <main className="app-layout-content" data-role={role}>
        {children}
      </main>
      <Footer />
    </div>
  );
}