/** Freeze the rendered page, rather than remounting its React tree during exit. */
export function captureRouteSnapshot(frame: HTMLElement) {
  const clone = frame.cloneNode(true) as HTMLElement
  const originals = frame.querySelectorAll<HTMLElement>("*")
  const copies = clone.querySelectorAll<HTMLElement>("*")
  const scroll: { index: number; top: number; left: number }[] = []
  originals.forEach((element, index) => {
    const copy = copies[index]
    if (element.scrollTop || element.scrollLeft)
      scroll.push({ index, top: element.scrollTop, left: element.scrollLeft })
    if (element instanceof HTMLInputElement) {
      copy.setAttribute("value", element.value)
      copy.toggleAttribute("checked", element.checked)
    } else if (element instanceof HTMLTextAreaElement) {
      copy.textContent = element.value
    } else if (element instanceof HTMLSelectElement) {
      Array.from((copy as HTMLSelectElement).options).forEach((option, i) => {
        option.toggleAttribute("selected", element.options[i].selected)
      })
    }
  })
  return {
    html: clone.innerHTML,
    scroll,
    scrollY: window.scrollY,
    pageBar: frame.dataset.pageBar,
  }
}

export function restoreSnapshotScroll(
  frame: HTMLElement | null,
  scroll: { index: number; top: number; left: number }[]
) {
  if (!frame) return
  const elements = frame.querySelectorAll<HTMLElement>("*")
  for (const position of scroll) {
    const element = elements[position.index]
    if (element) {
      element.scrollTop = position.top
      element.scrollLeft = position.left
    }
  }
}
