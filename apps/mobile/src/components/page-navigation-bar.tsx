import type { ComponentProps } from "react"
import { NavigationBar } from "@repo/ui"
import { PageBarActions, PageBarBack } from "./page-bar-actions"

/** Titles stay in the page; navigation and actions belong to the shared bar. */
export function PageNavigationBar({
  leading,
  trailing,
  ...props
}: ComponentProps<typeof NavigationBar>) {
  return (
    <NavigationBar
      {...props}
      leading={leading ? <PageBarBack>{leading}</PageBarBack> : undefined}
      trailing={
        trailing ? <PageBarActions>{trailing}</PageBarActions> : undefined
      }
    />
  )
}
