namespace Storage.Api.Helpers;

public static class BucketValidator
{
    public static bool IsValid(string name)
    {
        if (name.Length < 3 || name.Length > 63) return false;
        if (name == "admin") return false;
        return name.All(c => char.IsAsciiLetterLower(c) || char.IsAsciiDigit(c) || c is '-' or '.');
    }
}
