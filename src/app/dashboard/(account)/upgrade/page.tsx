import DashboardPage from "@/components/dashboard-page"
import { currentUser } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import UpgradePageContent from "./upgrade-page-content"
import { db } from "@/db"

export default async function page() {
  const auth = await currentUser()

  if (!auth) {
    redirect("/sign-in")
  }

  const user = await db.user.findUnique({
    where: { externalId: auth.id },
  })

  if (!user) {
    redirect("/sign-in")
  }
  return (
    <DashboardPage title="Pro Membership">
      <UpgradePageContent />
    </DashboardPage>
  )
}
