import { z } from "zod"
import { router } from "../__internals/router"
import { privateProcedure } from "../procedures"
import { db } from "@/db"
import { addMonths, startOfMonth } from "date-fns"
import { FREE_QUOTA } from "@/config"

export const projectRouter = router({
  setDiscordID: privateProcedure
    .input(z.object({ discordId: z.string().max(20) }))
    .mutation(async ({ c, input, ctx }) => {
      const { user } = ctx
      const { discordId } = input

      await db.user.update({
        where: {
          id: user.id,
        },
        data: {
          discordId,
        },
      })
      return c.json({ success: true })
    }),

  getUsage: privateProcedure.query(async ({ c, ctx }) => {
    const { user } = ctx

    const currentDate = startOfMonth(new Date())

    const quota = await db.quota.findFirst({
      where: {
        userId: user.id,
        month: currentDate.getMonth() + 1,
        year: currentDate.getFullYear(),
      },
    })

    const eventsCount = quota?.count ?? 0

    const categoryCount = await db.eventCategory.count({
      where: {
        userId: user.id,
      },
    })

    const limit = FREE_QUOTA

    const resetDate = addMonths(currentDate, 1)

    return c.superjson({
      categoryUsed: categoryCount,
      categoryLimit: limit.maxEventCategories,
      eventsUsed: eventsCount,
      eventsLimit: limit.maxEventsPerMonth,
      resetDate,
    })
  }),
})
