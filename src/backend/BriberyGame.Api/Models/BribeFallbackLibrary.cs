namespace BriberyGame.Api.Models;

public static class BribeFallbackLibrary
{
    private static readonly string[] Adjectives =
    [
        "absurd", "ancient", "anxious", "baffling", "bedazzled", "bouncy", "brave", "chaotic", "cheeky", "cosmic",
        "crunchy", "curious", "dapper", "dramatic", "dreamy", "electric", "enchanted", "fancy", "fearless", "fluffy",
        "glittery", "glorious", "grumpy", "heroic", "jazzy", "jolly", "legendary", "luminous", "majestic", "mischievous",
        "mysterious", "neon", "nervous", "peculiar", "polished", "prickly", "radiant", "rebellious", "ridiculous", "royal",
        "sassy", "shimmering", "sneaky", "sparkly", "spicy", "splendid", "suspicious", "swift", "tiny", "triumphant",
        "tropical", "unexpected", "velvety", "wobbly", "zesty", "whimsical", "fearsome", "delightful", "noisy", "unbreakable"
    ];

    private static readonly string[] Nouns =
    [
        "alpaca", "avocado", "backpack", "badger", "bagel", "banjo", "beehive", "bicycle", "blender", "cactus",
        "canoe", "castle", "cheesecake", "chicken", "comet", "cupcake", "dinosaur", "disco", "dragon", "duck",
        "elevator", "falcon", "firework", "flamingo", "fridge", "goblin", "hamster", "helicopter", "jellybean", "kazoo",
        "kiwi", "lampshade", "llama", "lobster", "marshmallow", "meteor", "monocle", "mushroom", "narwhal", "octopus",
        "pancake", "parrot", "penguin", "pickle", "pineapple", "pirate", "platypus", "potato", "rainbow", "robot",
        "sandwich", "saxophone", "sloth", "spaceship", "spatula", "teapot", "trombone", "unicorn", "waffle", "wizard"
    ];

    public static string Generate(Random random)
    {
        var firstIndex = random.Next(Adjectives.Length);
        var words = new List<string> { Adjectives[firstIndex] };

        if (random.Next(2) == 1)
        {
            var secondIndex = random.Next(Adjectives.Length - 1);
            if (secondIndex >= firstIndex)
                secondIndex++;
            words.Add(Adjectives[secondIndex]);
        }

        words.Add(Nouns[random.Next(Nouns.Length)]);
        words[0] = char.ToUpperInvariant(words[0][0]) + words[0][1..];
        return string.Join(' ', words);
    }
}
