namespace BriberyGame.Api.Models;

public static class PromptLibrary
{
    private static readonly string[] Prompts =
    [
        "The best excuse for being late",
        "The weirdest thing to bring to a picnic",
        "The ultimate snack for a film night",
        "The worst superpower to have at work",
        "The most dramatic way to ask for a favour",
        "The strangest item to find in a backpack",
        "The funniest reason to start a club",
        "The best gift for someone who has everything",
        "The most suspicious thing to say in a lift",
        "The worst theme for a birthday party",
        "Something you know would cheer me up after a long week",
        "Your best dad joke",
        "A tiny luxury I would secretly love",
        "The most chaotic sandwich order",
        "Something that would make me laugh in one sentence"
    ];

    public static string RandomPrompt(Random random)
    {
        return Prompts[random.Next(Prompts.Length)];
    }
}
