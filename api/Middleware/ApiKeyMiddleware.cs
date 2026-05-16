using Storage.Api.Data;
using Storage.Api.Models;

namespace Storage.Api.Middleware;

public class ApiKeyMiddleware(RequestDelegate next)
{
    public async Task InvokeAsync(HttpContext context, StorageDbContext db)
    {
        if (context.Request.Path.StartsWithSegments("/admin/setup") ||
            context.Request.Path.StartsWithSegments("/admin/unlock") ||
            context.Request.Path.StartsWithSegments("/download"))
        {
            await next(context);
            return;
        }

        string? key = context.Request.Headers["X-Access-Key"].FirstOrDefault()
            ?? context.Request.Query["accessKey"].FirstOrDefault();

        if (string.IsNullOrEmpty(key) || key.Length > 128)
        {
            context.Response.StatusCode = 403;
            await context.Response.WriteAsync("Missing X-Access-Key header");
            return;
        }

        AccessKey? accessKey = db.AccessKeys.FirstOrDefault(k => k.Id == key && k.IsActive);
        if (accessKey is null)
        {
            context.Response.StatusCode = 403;
            await context.Response.WriteAsync("Invalid or inactive access key");
            return;
        }

        context.Items["AccessKey"] = accessKey;
        await next(context);
    }
}
