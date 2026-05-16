using Microsoft.AspNetCore.Mvc;
using Storage.Api.Services;

namespace Storage.Api.Controllers;

[ApiController]
public class EventsController(NotificationService notifications) : ControllerBase
{
    [HttpGet("/events")]
    public async Task Stream(CancellationToken ct)
    {
        Response.ContentType = "text/event-stream";
        Response.Headers.CacheControl = "no-cache";
        Response.Headers["X-Accel-Buffering"] = "no";
        Response.Headers.Connection = "keep-alive";

        string clientId = notifications.Subscribe(Response);

        string connected = $"data: {{\"event\":\"connected\",\"clients\":{notifications.ClientCount}}}\n\n";
        await Response.WriteAsync(connected, ct);
        await Response.Body.FlushAsync(ct);

        try
        {
            while (!ct.IsCancellationRequested)
            {
                await Task.Delay(20_000, ct);
                await Response.WriteAsync(": keepalive\n\n", ct);
                await Response.Body.FlushAsync(ct);
            }
        }
        catch (OperationCanceledException) { }
        finally
        {
            notifications.Unsubscribe(clientId);
        }
    }
}
