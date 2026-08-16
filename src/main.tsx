import { createRoot } from "react-dom/client";
import CockipediaApp from "../components/CockipediaApp";
import "../app/globals.css";

const root = document.getElementById("root");

if (!root) throw new Error("Cockipedia could not find its application root.");

createRoot(root).render(
  <CockipediaApp />,
);
