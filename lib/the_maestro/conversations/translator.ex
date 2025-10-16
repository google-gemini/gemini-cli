defmodule TheMaestro.Conversations.Translator do
  @moduledoc """
  Provider-agnostic chat translators.

  Canonical format:
    %{"messages" => [%{"role" => role, "content" => [%{"type" => "text", "text" => content}]} ...]}

  Translation focuses on text parts for MVP.
  """

  @type canonical :: map()
  @type provider :: :openai | :anthropic | :gemini

  @spec to_provider(canonical(), provider()) :: {:ok, list()} | {:error, term()}
  def to_provider(%{"messages" => msgs}, :openai) do
    {:ok, Enum.map(msgs, &to_openai_msg/1)}
  end

  def to_provider(%{"messages" => msgs}, :anthropic) do
    {:ok, Enum.map(msgs, &to_openai_msg/1)}
  end

  def to_provider(%{"messages" => msgs}, :gemini) do
    {:ok, Enum.map(msgs, &to_gemini_msg/1)}
  end

  def to_provider(_c, _), do: {:error, :invalid_canonical}

  @spec from_provider(map() | list() | binary(), provider()) :: {:ok, canonical()} | {:error, term()}
  def from_provider(text, _provider) when is_binary(text) do
    {:ok,
     %{
       "messages" => [
         %{"role" => "assistant", "content" => [%{"type" => "text", "text" => text}]}
       ]
     }}
  end

  def from_provider(msgs, provider) when is_list(msgs) do
    case provider do
      :gemini ->
        {:ok,
         %{
           "messages" =>
             Enum.map(msgs, fn %{"role" => role, "parts" => parts} ->
               %{"role" => role, "content" => Enum.map(parts, &gemini_part_to_text/1)}
             end)
         }}

      _ ->
        {:ok,
         %{
           "messages" =>
             Enum.map(msgs, fn %{"role" => role, "content" => content} ->
               %{"role" => role, "content" => [%{"type" => "text", "text" => to_string(content)}]}
             end)
         }}
    end
  end

  def from_provider(_payload, _), do: {:error, :unsupported_payload}

  defp to_openai_msg(%{"role" => role} = m) do
    text = extract_text(m)
    %{"role" => role, "content" => text}
  end

  defp to_gemini_msg(%{"role" => role} = m) do
    text = extract_text(m)
    %{"role" => role, "parts" => [%{"text" => text}]}
  end

  defp extract_text(%{"content" => parts}) when is_list(parts) do
    parts
    |> Enum.map(fn
      %{"type" => "text", "text" => t} -> t
      %{"text" => t} -> t
      t when is_binary(t) -> t
      _ -> ""
    end)
    |> Enum.join("\n")
  end

  defp extract_text(%{"content" => t}) when is_binary(t), do: t
  defp extract_text(_), do: ""

  defp gemini_part_to_text(%{"text" => t}), do: %{"type" => "text", "text" => t}
  defp gemini_part_to_text(%{"inlineData" => _}), do: %{"type" => "text", "text" => "[binary]"}
  defp gemini_part_to_text(_), do: %{"type" => "text", "text" => ""}
end

