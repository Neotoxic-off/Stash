using Storage.Api.Helpers;
using Xunit;

namespace Storage.Api.Tests;

public class BucketValidatorTests
{
    [Theory]
    [InlineData("my-bucket")]
    [InlineData("bucket123")]
    [InlineData("abc")]
    [InlineData("a.b.c")]
    [InlineData("my-bucket-name-that-is-valid-and-long-enough-to-test")]
    public void ValidNames_Pass(string name) =>
        Assert.True(BucketValidator.IsValid(name));

    [Theory]
    [InlineData("ab")]                  // too short
    [InlineData("")]                    // empty
    [InlineData("admin")]               // reserved
    [InlineData("UPPERCASE")]           // uppercase
    [InlineData("has space")]           // space
    [InlineData("has_underscore")]      // underscore
    [InlineData("has@special")]         // special char
    [InlineData("a")]                   // too short
    public void InvalidNames_Fail(string name) =>
        Assert.False(BucketValidator.IsValid(name));

    [Fact]
    public void NameExactly63Chars_Passes() =>
        Assert.True(BucketValidator.IsValid(new string('a', 63)));

    [Fact]
    public void NameExactly64Chars_Fails() =>
        Assert.False(BucketValidator.IsValid(new string('a', 64)));

    [Fact]
    public void NameExactly3Chars_Passes() =>
        Assert.True(BucketValidator.IsValid("abc"));

    [Fact]
    public void NameExactly2Chars_Fails() =>
        Assert.False(BucketValidator.IsValid("ab"));
}
