// frontend/app/page.tsx
import { redirect } from "next/navigation";

const HomePage = (): never => {
  redirect("/login");
};

export default HomePage;
