import { DiscordClient } from "@/app/lib/discord-client"
import { CATEGORY_NAME_VALIDATOR } from "@/app/lib/validators/category-validator"
import { FREE_QUOTA, PRO_QUOTA } from "@/config"
import { db } from "@/db"
import { DeliveryStatus } from "@prisma/client"
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

const REQUEST_VALIDATOR = z
  .object({
    category: CATEGORY_NAME_VALIDATOR,
    fields: z.record(z.string().or(z.number().or(z.boolean()))).optional(),
    description: z.string().optional(),
  })
  .strict()

export const POST = async (req: NextRequest) => {
  try {
    const authHeader = req.headers.get("Authorization")

    if (!authHeader) {
      return NextResponse.json(
        {
          message: "Unauthorized",
        },
        { status: 401 }
      )
    }

    if (!authHeader.startsWith("Bearer ")) {
      return NextResponse.json(
        {
          message: "Invalid auth header format. Expected: 'Bearer [API_KEY]'",
        },
        { status: 401 }
      )
    }

    const apiKey = authHeader.split(" ")[1]

    if (!apiKey || apiKey.trim() === "") {
      return NextResponse.json(
        {
          message: "Invalid Api key",
        },
        { status: 401 }
      )
    }

    const user = await db.user.findUnique({
      where: { apiKey },
      include: { EventCategories: true },
    })

    if (!user?.discordId) {
      return NextResponse.json(
        {
          message: "Please enter your Discord ID in your account settings",
        },
        { status: 403 }
      )
    }

    const currentData = new Date()
    const currentMonth = currentData.getMonth() + 1
    const currentYear = currentData.getFullYear()

    const quota = await db.quota.findUnique({
      where: {
        userId: user.id,
        year: currentYear,
        month: currentMonth,
      },
    })

    const quotaLimit =
      user.plan === "FREE"
        ? FREE_QUOTA.maxEventsPerMonth
        : PRO_QUOTA.maxEventsPerMonth

    if (quota && quota.count >= quotaLimit) {
      return NextResponse.json(
        {
          message: `You have reached your ${user.plan} quota limit for this month`,
        },
        { status: 429 }
      )
    }

    const discord = new DiscordClient(process.env.DISCORD_BOT_TOKEN)

    const dmChannel = await discord.createDM(user.discordId)

    await discord.sendEmbed(dmChannel.id, {
      title: "Hello World!!!",
    })

    let requestData: unknown

    try {
      requestData = req.json()
    } catch (error) {
      return NextResponse.json(
        {
          message: "Invalid JSON request body",
        },
        {
          status: 400,
        }
      )
    }

    const validatedResult = REQUEST_VALIDATOR.parse(requestData)

    const category = user.EventCategories.find(
      (cat) => cat.name === validatedResult.category
    )

    if (!category) {
      return NextResponse.json(
        {
          message: `You dont have a category named "${validatedResult.category}"`,
        },
        {
          status: 404,
        }
      )
    }

    const eventData = {
      title: `${category.emoji || "🔔"} ${
        category.name.charAt(0).toUpperCase() + category.name.slice(1)
      }`,
      description:
        validatedResult.description ||
        `A new ${category.name} event has occurred`,
      color: category.color,
      timestamp: new Date().toISOString(),
      fields: Object.entries(validatedResult.fields || {}).map(
        ([key, value]) => {
          return {
            name: key,
            value: String(value),
            inline: true,
          }
        }
      ),
    }

    const event = await db.event.create({
      data: {
        name: category.name,
        formattedMessage: `${eventData.title}\n\n${eventData.description}`,
        userId: user.id,
        eventCategoryId: category.id,
        fields: validatedResult.fields || {},
      },
    })

    try {
      await discord.sendEmbed(dmChannel.id, eventData)

      await db.event.update({
        where: {
          id: event.id,
        },
        data: { deliveryStatus: "DELIVERED" },
      })

      await db.quota.upsert({
        where: { userId: user.id, month: currentMonth, year: currentYear },
        update: { count: { increment: 1 } },
        create: {
          userId: user.id,
          month: currentMonth,
          year: currentYear,
          count: 1,
        },
      })
    } catch (error) {
      await db.event.update({
        where: {
          id: event.id,
        },
        data: { deliveryStatus: "FAILED" },
      })

      return NextResponse.json(
        {
          message: "Failed to send event to Discord",
          eventId: event.id,
        },
        {
          status: 500,
        }
      )
    }

    return NextResponse.json({
      message: "Event created successfully",
      eventId: event.id,
    })
  } catch (error) {
    if(error instanceof z.ZodError){
      return NextResponse.json(
        {
          message: error.message,
        },
        {
          status: 422,
        }
      )
    }

    return NextResponse.json(
      {
        message: "An unexpected error occurred",
        error: error.message,
      },
      {
        status: 500,
      }
    )
  }
}
