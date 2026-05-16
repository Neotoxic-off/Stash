using System.Data.Common;
using System.Security.Cryptography;
using Microsoft.EntityFrameworkCore;
using Storage.Api.Data;
using Storage.Api.Middleware;
using Storage.Api.Models;
using Storage.Api.Services;

WebApplicationBuilder builder = WebApplication.CreateBuilder(args);

string storagePath = builder.Configuration["Storage:Path"]
    ?? Path.Combine(Directory.GetCurrentDirectory(), "storage");

builder.Services.AddDbContext<StorageDbContext>(opt =>
    opt.UseSqlite($"Data Source={Path.Combine(storagePath, "metadata.db")}"));

string? encryptionKey = builder.Configuration["Encryption:Key"];
builder.Services.AddSingleton<IStorageService>(_ => new LocalStorageService(storagePath, encryptionKey));
builder.Services.AddSingleton<NotificationService>();
builder.Services.AddControllers();

builder.Services.AddCors(opt =>
    opt.AddDefaultPolicy(p => p
        .AllowAnyOrigin()
        .AllowAnyMethod()
        .AllowAnyHeader()
        .WithExposedHeaders("ETag", "Content-Disposition", "Content-Length", "Last-Modified", "x-amz-checksum-sha256")));

builder.WebHost.ConfigureKestrel(opts =>
{
    opts.Limits.MaxRequestBodySize = null;
    opts.Limits.MaxRequestBufferSize = null;
});

WebApplication app = builder.Build();

using (IServiceScope scope = app.Services.CreateScope())
{
    Directory.CreateDirectory(storagePath);
    StorageDbContext db = scope.ServiceProvider.GetRequiredService<StorageDbContext>();
    db.Database.EnsureCreated();

    // Add Sha256 column to existing databases that pre-date this field
    DbConnection conn = db.Database.GetDbConnection();
    conn.Open();
    using (DbCommand pragma = conn.CreateCommand())
    {
        pragma.CommandText = "PRAGMA table_info(Objects)";
        using DbDataReader reader = pragma.ExecuteReader();
        HashSet<string> cols = [];
        while (reader.Read()) cols.Add(reader.GetString(1));
        if (!cols.Contains("Sha256"))
        {
            using DbCommand alter = conn.CreateCommand();
            alter.CommandText = "ALTER TABLE Objects ADD COLUMN Sha256 TEXT";
            alter.ExecuteNonQuery();
        }
    }
    conn.Close();

    if (!db.AccessKeys.Any())
    {
        db.AccessKeys.Add(new AccessKey
        {
            Id = Convert.ToHexString(RandomNumberGenerator.GetBytes(10)).ToUpper(),
            Secret = Convert.ToBase64String(RandomNumberGenerator.GetBytes(30))
                .Replace('+', '-').Replace('/', '_').TrimEnd('='),
            Name = "default",
            CreatedAt = DateTime.UtcNow,
            IsActive = true,
        });
        db.SaveChanges();
    }
}

app.UseCors();
app.UseMiddleware<ApiKeyMiddleware>();
app.MapControllers();

app.Run();

public partial class Program { }
