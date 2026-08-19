local function percent_encode(value)
  return (value:gsub("([^A-Za-z0-9%-._~])", function(character)
    return string.format("%%%02X", string.byte(character))
  end))
end

function Meta(meta)
  local title = pandoc.utils.stringify(meta.title)
  meta["email-subject"] = pandoc.MetaString(percent_encode("Re: " .. title))
  return meta
end
