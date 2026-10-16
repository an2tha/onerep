import { useEffect, useRef, useState } from "react"
import { useLocation, useNavigate } from "react-router"
import { useAppAuth } from "@/lib/auth-client"
import {
  ArrowLeft,
  ArrowUpRight,
  BookmarkSimple,
  Check,
  DownloadSimple,
  BookOpen,
  MagnifyingGlass,
} from "@phosphor-icons/react"
import {
  GroupedList,
  DisclosureRow,
  SectionHeader,
} from "@repo/ui/components/mobile-ui"
import { Button } from "@repo/ui/components/ui/button"
import { Input } from "@repo/ui/components/ui/input"
import { NativeSelect } from "@repo/ui/components/ui/native-select"
import guidesData from "./library/guides.json"
import termsData from "./library/terms.json"
import sourcesData from "./library/sources.json"
import "./library.css"
const guides = guidesData,
  terms = [...termsData].sort((a, b) => a.name.localeCompare(b.name))
const sources = sourcesData as Record<
  string,
  { title: string; url: string; type: string }
>
const diagrams = import.meta.glob("./diagrams/*.svg", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>
const categories = [
  "Strength",
  "Conditioning",
  "Nutrition",
  "Recovery",
  "Your data",
]
const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
const minutes = (g: (typeof guides)[number]) =>
  Math.max(
    2,
    Math.ceil(
      [g.summary, ...g.sections.map((s) => s.text), g.example, ...g.steps]
        .join(" ")
        .split(/\s+/).length / 200
    )
  )
function decodeEntry(value: string) {
  try {
    return decodeURIComponent(value)
  } catch {
    return ""
  }
}
function persist(key: string, values: Set<string>) {
  try {
    localStorage.setItem(key, JSON.stringify([...values]))
  } catch {
    /* Reading remains available when storage is disabled. */
  }
}
function storedSet(key: string) {
  try {
    return new Set<string>(JSON.parse(localStorage.getItem(key) || "[]"))
  } catch {
    return new Set<string>()
  }
}
function Figure({
  prefix,
  id,
  title,
  caption,
}: {
  prefix: string
  id: string
  title: string
  caption: string
}) {
  const raw = diagrams[`./diagrams/${prefix}-${id}.svg`]
  if (!raw) return null
  return (
    <figure className="reference-figure">
      <div className="figure-heading">
        <strong>{title}</strong>
        <a
          href={"data:image/svg+xml;charset=utf-8," + encodeURIComponent(raw)}
          download={`${prefix}-${id}.svg`}
          aria-label={`Download diagram: ${title}`}
          title="Download SVG"
        >
          <DownloadSimple size={18} />
        </a>
      </div>
      <div className="diagram-svg" dangerouslySetInnerHTML={{ __html: raw }} />
      <figcaption>{caption}</figcaption>
    </figure>
  )
}
function References({ ids }: { ids: string[] }) {
  return (
    <section className="article-references">
      <h3>{ids.length ? "Sources & further reading" : "About this guide"}</h3>
      {ids.length ? (
        <ul>
          {ids.map((id) => (
            <li key={id}>
              <a href={sources[id].url} target="_blank" rel="noreferrer">
                {sources[id].title}
                <ArrowUpRight size={14} />
              </a>
              <span>{sources[id].type}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p>
          A practical framework for keeping and interpreting your own records.
          The worked examples and diagrams are illustrative, not findings from a
          clinical trial.
        </p>
      )}
      <p className="reference-date">
        Compiled 16 October 2026. General education for adults; examples are not
        individual prescriptions.
      </p>
    </section>
  )
}
export function KnowledgeLibrary({
  mode,
  onModeChange,
  onAsk,
}: {
  mode: "guides" | "glossary"
  onModeChange: (mode: "guides" | "glossary") => void
  onAsk: (text: string) => void
}) {
  const location = useLocation()
  const navigate = useNavigate()
  const { userId } = useAppAuth()
  const entry = decodeEntry(location.pathname.split("/")[3] || "")
  const storageKey = (kind: string) => `onerep-coach-library-${kind}:${userId}`
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState("All")
  const [letter, setLetter] = useState("All")
  const [savedOnly, setSavedOnly] = useState(false)
  const [saved, setSaved] = useState(() => storedSet(storageKey("saved")))
  const [read, setRead] = useState(() => storedSet(storageKey("read")))
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    setSaved(storedSet(storageKey("saved")))
    setRead(storedSet(storageKey("read")))
  }, [userId])
  const open = (m: "guides" | "glossary", id = "") => {
    navigate(`/coach/${m}${id ? "/" + encodeURIComponent(id) : ""}`)
    if (m !== mode) {
      setCategory("All")
      setLetter("All")
      setQuery("")
      setSavedOnly(false)
    }
    requestAnimationFrame(() => {
      heading.current?.focus({ preventScroll: true })
      heading.current?.closest(".center-scroll")?.scrollTo(0, 0)
    })
  }
  const toggleSaved = (key: string) => {
    const next = new Set(saved)
    next.has(key) ? next.delete(key) : next.add(key)
    setSaved(next)
    persist(storageKey("saved"), next)
  }
  const markRead = (id: string) => {
    const next = new Set(read)
    next.has(id) ? next.delete(id) : next.add(id)
    setRead(next)
    persist(storageKey("read"), next)
  }
  const guide =
    mode === "guides" ? guides.find((g) => g.id === entry) : undefined
  const term =
    mode === "glossary" ? terms.find((t) => t.id === entry) : undefined
  const tokens = normalize(query).split(" ").filter(Boolean)
  const matches = (s: string) => tokens.every((q) => normalize(s).includes(q))
  const filteredGuides = guides.filter(
    (g) =>
      (category === "All" || g.category === category) &&
      (!savedOnly || saved.has("guide-" + g.id)) &&
      matches(
        g.title +
          " " +
          g.summary +
          " " +
          g.category +
          " " +
          g.terms.join(" ") +
          " " +
          g.sections.map((s) => s.text).join(" ")
      )
  )
  const filteredTerms = terms.filter(
    (t) =>
      (category === "All" || t.category === category) &&
      (letter === "All" || t.name[0].toUpperCase() === letter) &&
      (!savedOnly || saved.has("term-" + t.id)) &&
      matches(t.name + " " + t.aliases + " " + t.definition + " " + t.category)
  )
  const saveButton = (key: string) => (
    <Button
      variant="outline"
      aria-pressed={saved.has(key)}
      onClick={() => toggleSaved(key)}
    >
      <BookmarkSimple size={17} weight={saved.has(key) ? "fill" : "regular"} />
      {saved.has(key) ? "Saved" : "Save"}
    </Button>
  )
  if (guide)
    return (
      <section className="knowledge-library article-view">
        <Button
          variant="ghost"
          className="library-back"
          onClick={() => open("guides")}
        >
          <ArrowLeft size={18} />
          All guides
        </Button>
        <div className="article-meta">
          <span>{guide.category}</span>
          <span>{minutes(guide)} min read</span>
          {read.has(guide.id) && (
            <span>
              <Check size={13} />
              Read
            </span>
          )}
        </div>
        <h2 ref={heading} tabIndex={-1}>
          {guide.title}
        </h2>
        <p className="article-deck">{guide.summary}</p>
        <div className="article-tools">
          {saveButton("guide-" + guide.id)}
          <Button variant="ghost" onClick={() => markRead(guide.id)}>
            <Check size={17} />
            {read.has(guide.id) ? "Marked as read" : "Mark as read"}
          </Button>
        </div>
        <div className="article-layout">
          <aside className="article-contents">
            <h3>In this guide</h3>
            {guide.sections.map((s, i) => (
              <button
                key={s.title}
                onClick={() =>
                  document
                    .getElementById(`article-part-${i}`)
                    ?.scrollIntoView({
                      behavior: matchMedia("(prefers-reduced-motion: reduce)")
                        .matches
                        ? "instant"
                        : "smooth",
                      block: "start",
                    })
                }
              >
                {s.title}
              </button>
            ))}
            <button
              onClick={() =>
                document
                  .getElementById("article-example")
                  ?.scrollIntoView({
                    behavior: matchMedia("(prefers-reduced-motion: reduce)")
                      .matches
                      ? "instant"
                      : "smooth",
                    block: "start",
                  })
              }
            >
              Worked example
            </button>
          </aside>
          <div className="article-body">
            <Figure
              prefix="guide"
              id={guide.id}
              title={guide.diagram.title}
              caption={guide.diagram.caption}
            />
            {guide.sections.map((s, i) => (
              <section
                key={s.title}
                id={`article-part-${i}`}
                className="article-part"
              >
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </section>
            ))}
            <section id="article-example" className="worked-example">
              <h3>Worked example</h3>
              <p>{guide.example}</p>
            </section>
            <section className="article-part">
              <h3>Try this in your next review</h3>
              <ol className="practice-steps">
                {guide.steps.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
            </section>
            <section className="article-part">
              <h3>Terms in this guide</h3>
              <div className="term-links">
                {guide.terms.map((name) => {
                  const t = terms.find((t) => t.name === name)
                  return t ? (
                    <button key={name} onClick={() => open("glossary", t.id)}>
                      {name}
                      <ArrowUpRight size={13} />
                    </button>
                  ) : null
                })}
              </div>
            </section>
            <References ids={guide.sources} />
            <div className="article-bottom">
              <Button
                variant="outline"
                onClick={() =>
                  onAsk(
                    `Explain the guide “${guide.title}” in relation to my training. The guide covers: ${guide.summary}`
                  )
                }
              >
                <BookOpen size={17} />
                Discuss this guide
              </Button>
              <Button variant="ghost" onClick={() => open("guides")}>
                Back to guides
              </Button>
            </div>
          </div>
        </div>
      </section>
    )
  if (term) {
    const related = guides.find((g) => g.id === term.guide)!
    return (
      <section className="knowledge-library term-detail">
        <Button
          variant="ghost"
          className="library-back"
          onClick={() => open("glossary")}
        >
          <ArrowLeft size={18} />
          All terms
        </Button>
        <div className="article-meta">
          <span>{term.category}</span>
        </div>
        <h2 ref={heading} tabIndex={-1}>
          {term.name}
        </h2>
        <p className="term-definition">{term.definition}</p>
        <div className="article-tools">{saveButton("term-" + term.id)}</div>
        <Figure
          prefix="term"
          id={term.id}
          title={term.diagram.title}
          caption={term.diagram.caption}
        />
        <section className="article-part">
          <h3>In practice</h3>
          <p>{term.example}</p>
        </section>
        <section className="article-part">
          <h3>Keep in mind</h3>
          <p>{term.caution}</p>
        </section>
        <SectionHeader title="Read the guide" />
        <GroupedList>
          <DisclosureRow
            title={related.title}
            detail={`${related.category} · ${minutes(related)} min read`}
            onClick={() => open("guides", related.id)}
          />
        </GroupedList>
        {term.sources.length > 0 && <References ids={term.sources} />}
        <div className="article-bottom">
          <Button
            variant="outline"
            onClick={() =>
              onAsk(
                `Explain ${term.name}. Reference definition: ${term.definition}`
              )
            }
          >
            Ask about this term
          </Button>
          <Button variant="ghost" onClick={() => open("glossary")}>
            Back to glossary
          </Button>
        </div>
      </section>
    )
  }
  if (entry)
    return (
      <section className="knowledge-library">
        <h2 ref={heading} tabIndex={-1}>
          This entry isn’t in the library.
        </h2>
        <Button variant="outline" onClick={() => open(mode)}>
          Browse {mode === "guides" ? "guides" : "glossary"}
        </Button>
      </section>
    )
  const filtered = mode === "guides" ? filteredGuides : filteredTerms
  const countSaved = [...saved].filter((s) =>
    s.startsWith(mode === "guides" ? "guide-" : "term-")
  ).length
  return (
    <section className="knowledge-library library-index">
      <div
        className="library-switch"
        role="group"
        aria-label="Reference library"
      >
        <Button
          variant="ghost"
          aria-pressed={mode === "guides"}
          onClick={() => open("guides")}
        >
          Improvement guides <span>{guides.length}</span>
        </Button>
        <Button
          variant="ghost"
          aria-pressed={mode === "glossary"}
          onClick={() => open("glossary")}
        >
          Glossary <span>{terms.length}</span>
        </Button>
      </div>
      <h2 ref={heading} tabIndex={-1}>
        {mode === "guides"
          ? "Training, nutrition, and recovery"
          : "Training glossary"}
      </h2>
      <p className="library-intro">
        {mode === "guides"
          ? "Practical explanations, worked examples, and diagrams."
          : "Definitions, examples, and the distinctions that matter."}
      </p>
      <div className="library-search">
        <MagnifyingGlass size={19} />
        <Input
          aria-label={
            mode === "guides" ? "Search improvement guides" : "Search glossary"
          }
          placeholder={
            mode === "guides"
              ? "Search guides, topics, or questions"
              : "Search a term or abbreviation"
          }
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setLetter("All")
          }}
        />
        {query && (
          <Button variant="ghost" onClick={() => setQuery("")}>
            Clear
          </Button>
        )}
      </div>
      <div className="library-filterbar">
        <label>
          <span className="sr-only">Topic</span>
          <NativeSelect
            aria-label="Topic"
            value={category}
            onChange={(e) => {
              setCategory(e.target.value)
              setLetter("All")
            }}
          >
            <option value="All">All topics</option>
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </NativeSelect>
        </label>
        <Button
          variant="outline"
          aria-pressed={savedOnly}
          onClick={() => setSavedOnly(!savedOnly)}
        >
          <BookmarkSimple size={16} />
          {savedOnly ? "Showing saved" : "Saved"}{" "}
          {countSaved > 0 && <span>{countSaved}</span>}
        </Button>
        <span className="result-count" aria-live="polite">
          {filtered.length}{" "}
          {mode === "guides"
            ? filtered.length === 1
              ? "guide"
              : "guides"
            : filtered.length === 1
              ? "term"
              : "terms"}
        </span>
      </div>
      {mode === "glossary" && (
        <nav className="alphabet-nav" aria-label="Filter terms by first letter">
          {["All", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"].map((l) => (
            <button
              key={l}
              aria-label={
                l === "All" ? "All letters" : `Terms beginning with ${l}`
              }
              aria-pressed={letter === l}
              disabled={
                l !== "All" &&
                !terms.some(
                  (t) =>
                    t.name[0].toUpperCase() === l &&
                    (category === "All" || t.category === category)
                )
              }
              onClick={() => {
                setLetter(l)
                setQuery("")
              }}
            >
              {l}
            </button>
          ))}
        </nav>
      )}
      {filtered.length === 0 ? (
        <div className="library-empty">
          <h3>{savedOnly ? "No saved entries match." : "No matches found."}</h3>
          <p>
            {savedOnly
              ? "Save a guide or term using its bookmark button."
              : "Try a broader word, such as “rest”, “protein”, or “effort”."}
          </p>
          <Button
            variant="outline"
            onClick={() => {
              setQuery("")
              setCategory("All")
              setLetter("All")
              setSavedOnly(false)
            }}
          >
            Show all {mode === "guides" ? "guides" : "terms"}
          </Button>
        </div>
      ) : mode === "guides" ? (
        categories
          .filter((c) => filteredGuides.some((g) => g.category === c))
          .map((c) => (
            <section className="library-section" key={c}>
              <SectionHeader title={c} />
              <GroupedList label={`${c} guides`}>
                {filteredGuides
                  .filter((g) => g.category === c)
                  .map((g) => (
                    <DisclosureRow
                      key={g.id}
                      title={
                        <span className="reference-row-title">
                          {g.title}
                          {saved.has("guide-" + g.id) && (
                            <BookmarkSimple size={14} weight="fill" />
                          )}
                        </span>
                      }
                      detail={g.summary}
                      value={
                        <span className="reading-time">
                          {minutes(g)} min
                          {read.has(g.id) && <Check size={12} />}
                        </span>
                      }
                      onClick={() => open("guides", g.id)}
                    />
                  ))}
              </GroupedList>
            </section>
          ))
      ) : (
        <GroupedList label="Glossary entries" className="glossary-list">
          {filteredTerms.map((t) => (
            <DisclosureRow
              key={t.id}
              title={
                <span className="reference-row-title">
                  {t.name}
                  {saved.has("term-" + t.id) && (
                    <BookmarkSimple size={14} weight="fill" />
                  )}
                </span>
              }
              detail={t.definition}
              value={<span className="term-category">{t.category}</span>}
              onClick={() => open("glossary", t.id)}
            />
          ))}
        </GroupedList>
      )}
      <footer className="library-footer">
        General education for adults. Source links and limitations accompany the
        relevant entries. All diagrams are original SVGs; numerical examples are
        illustrative.
      </footer>
    </section>
  )
}
