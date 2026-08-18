function Header(header)
  if header.identifier == "" then
    return header
  end

  local label = pandoc.utils.stringify(header.content)
  local anchor = pandoc.Link(
    { pandoc.Str("#") },
    "#" .. header.identifier,
    "",
    pandoc.Attr(
      "",
      { "heading-anchor" },
      { { "aria-label", "Link to “" .. label .. "”" } }
    )
  )

  header.content:insert(pandoc.Space())
  header.content:insert(anchor)
  return header
end
