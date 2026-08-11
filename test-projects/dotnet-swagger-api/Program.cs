using System.ComponentModel.DataAnnotations;
using System.Text;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.OpenApi.Models;

var builder = WebApplication.CreateBuilder(args);
var fixtureApiKey = builder.Configuration["TAPIR_FIXTURE_API_KEY"] ?? "tapir-dotnet-secret";
var fixtureBearerToken = builder.Configuration["TAPIR_FIXTURE_BEARER_TOKEN"] ?? "tapir-dotnet-token";
var fixtureUsername = builder.Configuration["TAPIR_FIXTURE_USERNAME"] ?? "tapir";
var fixturePassword = builder.Configuration["TAPIR_FIXTURE_PASSWORD"] ?? "tapir-dotnet-password";
var fixtureQueryApiKey = builder.Configuration["TAPIR_FIXTURE_QUERY_API_KEY"] ?? "tapir-dotnet-query-secret";
var fixtureCookieApiKey = builder.Configuration["TAPIR_FIXTURE_COOKIE_API_KEY"] ?? "tapir-dotnet-session";

builder.Services.ConfigureHttpJsonOptions(options =>
{
    options.SerializerOptions.Converters.Add(new JsonStringEnumConverter());
});
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy
            .AllowAnyOrigin()
            .AllowAnyHeader()
            .AllowAnyMethod();
    });
});
builder.Services.AddSwaggerGen(options =>
{
    options.SwaggerDoc("v1", new()
    {
        Title = "Tapir .NET Logistics API",
        Version = "0.2.0",
        Description = "ASP.NET Core fixture with realistic typed endpoints for testing Tapir.",
        Contact = new() { Name = "Tapir Fixture Team", Email = "fixtures@example.test" },
        License = new() { Name = "MIT" }
    });
    options.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Type = SecuritySchemeType.Http,
        Scheme = "bearer",
        BearerFormat = "JWT",
        Description = "JWT bearer token used by the fixture's protected operations."
    });
    options.AddSecurityDefinition("ApiKey", new OpenApiSecurityScheme
    {
        Type = SecuritySchemeType.ApiKey,
        In = ParameterLocation.Header,
        Name = "x-api-key",
        Description = "Static API key for fixture clients."
    });
    options.AddSecurityDefinition("Basic", new OpenApiSecurityScheme
    {
        Type = SecuritySchemeType.Http,
        Scheme = "basic",
        Description = "HTTP Basic credentials used by the fixture."
    });
    options.AddSecurityDefinition("QueryApiKey", new OpenApiSecurityScheme
    {
        Type = SecuritySchemeType.ApiKey,
        In = ParameterLocation.Query,
        Name = "api_key",
        Description = "Static API key passed in the query string."
    });
    options.AddSecurityDefinition("CookieApiKey", new OpenApiSecurityScheme
    {
        Type = SecuritySchemeType.ApiKey,
        In = ParameterLocation.Cookie,
        Name = "tapir_session",
        Description = "Static API key passed in a cookie."
    });
    options.OperationFilter<ApiKeyOperationFilter>();
});

var app = builder.Build();

app.UseCors();
app.UseSwagger();
app.UseSwaggerUI();

var forecasts = new List<WeatherForecast>
{
    new(1, "Yerevan", 32, WeatherSummary.Sunny, DateOnly.FromDateTime(DateTime.UtcNow), new("am-evn-01", "AM", 40.1872, 44.5152)),
    new(2, "Seattle", 18, WeatherSummary.Cloudy, DateOnly.FromDateTime(DateTime.UtcNow.AddDays(1)), new("us-sea-02", "US", 47.6062, -122.3321)),
    new(3, "Lisbon", 26, WeatherSummary.Breezy, DateOnly.FromDateTime(DateTime.UtcNow.AddDays(2)), new("pt-lis-03", "PT", 38.7223, -9.1393))
};

var shipments = new List<Shipment>
{
    new(
        "shp_1001",
        ShipmentStatus.InTransit,
        new Party("sender_1", "Cascade Outfitters", new Address("110 Pine St", null, "Seattle", "WA", "98101", "US")),
        new Party("receiver_1", "Ararat Retail", new Address("12 Northern Ave", "Suite 4", "Yerevan", "ER", "0001", "AM")),
        new Parcel(2.4m, "kg", new Dimensions(30, 20, 12, "cm"), new[] { "outdoor", "priority" }),
        new Money(149.99m, "USD"),
        DateOnly.FromDateTime(DateTime.UtcNow.AddDays(5)),
        new Dictionary<string, string> { ["warehouse"] = "sea-1", ["lane"] = "intl-express" },
        new[]
        {
            new TrackingEvent("accepted", DateTimeOffset.UtcNow.AddDays(-2), "Seattle", "Shipment accepted at origin facility."),
            new TrackingEvent("departed", DateTimeOffset.UtcNow.AddDays(-1), "Seattle", "Shipment departed origin facility.")
        })
};

app.MapGet("/health", () => Results.Ok(new HealthResponse(
        "ok",
        "tapir-dotnet-logistics-api",
        TimeSpan.FromMilliseconds(Environment.TickCount64).TotalSeconds,
        new Dictionary<string, DependencyHealth>
        {
            ["database"] = new("ok", 6),
            ["carrierGateway"] = new("ok", 42)
        })))
    .WithName("GetHealth")
    .WithTags("System")
    .WithSummary("Get API health")
    .Produces<HealthResponse>();

app.MapGet("/auth/api-key", ([FromHeader(Name = "x-api-key")] string? apiKey) =>
        apiKey == fixtureApiKey
            ? Results.Ok(new AuthenticatedIdentity(true, "apiKey"))
            : Results.Json(
                new ProblemDetails { Title = "Unauthorized", Detail = "Provide the fixture API key in the x-api-key header.", Status = StatusCodes.Status401Unauthorized },
                statusCode: StatusCodes.Status401Unauthorized))
    .WithName("GetApiKeyIdentity")
    .WithTags("System")
    .WithSummary("Verify an API key")
    .WithDescription("Requires the x-api-key header. The local fixture accepts tapir-dotnet-secret by default.")
    .Produces<AuthenticatedIdentity>()
    .Produces<ProblemDetails>(StatusCodes.Status401Unauthorized);

app.MapGet("/auth/bearer", ([FromHeader(Name = "Authorization")] string? authorization) =>
        authorization == $"Bearer {fixtureBearerToken}"
            ? Results.Ok(new AuthenticatedIdentity(true, "bearer"))
            : Results.Json(
                new ProblemDetails { Title = "Unauthorized", Detail = "Provide the fixture bearer token in the Authorization header.", Status = StatusCodes.Status401Unauthorized },
                statusCode: StatusCodes.Status401Unauthorized))
    .WithName("GetBearerIdentity")
    .WithTags("System")
    .WithSummary("Verify a bearer token")
    .WithDescription("Requires an HTTP bearer token. The local fixture accepts tapir-dotnet-token by default.")
    .Produces<AuthenticatedIdentity>()
    .Produces<ProblemDetails>(StatusCodes.Status401Unauthorized);

app.MapGet("/auth/basic", ([FromHeader(Name = "Authorization")] string? authorization) =>
        authorization == $"Basic {Convert.ToBase64String(Encoding.UTF8.GetBytes($"{fixtureUsername}:{fixturePassword}"))}"
            ? Results.Ok(new AuthenticatedIdentity(true, "basic"))
            : Results.Json(new ProblemDetails { Title = "Unauthorized", Detail = "Provide the fixture username and password with HTTP Basic authentication.", Status = StatusCodes.Status401Unauthorized }, statusCode: StatusCodes.Status401Unauthorized))
    .WithName("GetBasicIdentity")
    .WithTags("System")
    .WithSummary("Verify basic authentication")
    .Produces<AuthenticatedIdentity>()
    .Produces<ProblemDetails>(StatusCodes.Status401Unauthorized);

app.MapGet("/auth/query-api-key", ([FromQuery(Name = "api_key")] string? apiKey) =>
        apiKey == fixtureQueryApiKey
            ? Results.Ok(new AuthenticatedIdentity(true, "queryApiKey"))
            : Results.Json(new ProblemDetails { Title = "Unauthorized", Detail = "Provide the fixture API key in the api_key query parameter.", Status = StatusCodes.Status401Unauthorized }, statusCode: StatusCodes.Status401Unauthorized))
    .WithName("GetQueryApiKeyIdentity")
    .WithTags("System")
    .WithSummary("Verify a query-string API key")
    .Produces<AuthenticatedIdentity>()
    .Produces<ProblemDetails>(StatusCodes.Status401Unauthorized);

app.MapGet("/auth/cookie-api-key", (HttpRequest request) =>
        request.Cookies["tapir_session"] == fixtureCookieApiKey
            ? Results.Ok(new AuthenticatedIdentity(true, "cookieApiKey"))
            : Results.Json(new ProblemDetails { Title = "Unauthorized", Detail = "Provide the fixture API key in the tapir_session cookie.", Status = StatusCodes.Status401Unauthorized }, statusCode: StatusCodes.Status401Unauthorized))
    .WithName("GetCookieApiKeyIdentity")
    .WithTags("System")
    .WithSummary("Verify a cookie API key")
    .Produces<AuthenticatedIdentity>()
    .Produces<ProblemDetails>(StatusCodes.Status401Unauthorized);

app.MapGet("/auth/alternative", (HttpRequest request, [FromHeader(Name = "x-api-key")] string? apiKey) =>
    {
        var apiKeyAccepted = apiKey == fixtureApiKey;
        var bearerAccepted = request.Headers.Authorization == $"Bearer {fixtureBearerToken}";
        return apiKeyAccepted || bearerAccepted
            ? Results.Ok(new AuthenticatedIdentity(true, apiKeyAccepted ? "apiKey" : "bearer"))
            : Results.Json(new ProblemDetails { Title = "Unauthorized", Detail = "Provide either the fixture API key or bearer token.", Status = StatusCodes.Status401Unauthorized }, statusCode: StatusCodes.Status401Unauthorized);
    })
    .WithName("GetAlternativeIdentity")
    .WithTags("System")
    .WithSummary("Verify either an API key or bearer token")
    .Produces<AuthenticatedIdentity>()
    .Produces<ProblemDetails>(StatusCodes.Status401Unauthorized);

app.MapGet("/auth/combined", (HttpRequest request, [FromHeader(Name = "x-api-key")] string? apiKey) =>
    {
        var basic = $"Basic {Convert.ToBase64String(Encoding.UTF8.GetBytes($"{fixtureUsername}:{fixturePassword}"))}";
        return apiKey == fixtureApiKey && request.Headers.Authorization == basic
            ? Results.Ok(new AuthenticatedIdentity(true, "apiKey+basic"))
            : Results.Json(new ProblemDetails { Title = "Unauthorized", Detail = "Provide both the fixture API key and basic credentials.", Status = StatusCodes.Status401Unauthorized }, statusCode: StatusCodes.Status401Unauthorized);
    })
    .WithName("GetCombinedIdentity")
    .WithTags("System")
    .WithSummary("Verify an API key and basic authentication together")
    .Produces<AuthenticatedIdentity>()
    .Produces<ProblemDetails>(StatusCodes.Status401Unauthorized);

app.MapGet("/auth/optional", ([FromHeader(Name = "Authorization")] string? authorization) =>
    {
        var authenticated = authorization == $"Bearer {fixtureBearerToken}";
        return Results.Ok(new AuthenticatedIdentity(authenticated, authenticated ? "bearer" : "anonymous"));
    })
    .WithName("GetOptionalIdentity")
    .WithTags("System")
    .WithSummary("Accept anonymous or bearer-authenticated requests")
    .Produces<AuthenticatedIdentity>();

app.MapGet("/weather", (
        [FromQuery] string? city,
        [FromQuery] DateOnly? startDate,
        [FromQuery] WeatherSummary? summary,
        [FromHeader(Name = "x-correlation-id")] string? correlationId) =>
    {
        var results = forecasts.AsEnumerable();

        if (!string.IsNullOrWhiteSpace(city))
        {
            results = results.Where(forecast => forecast.City.Equals(city, StringComparison.OrdinalIgnoreCase));
        }

        if (startDate is not null)
        {
            results = results.Where(forecast => forecast.ForecastDate >= startDate);
        }

        if (summary is not null)
        {
            results = results.Where(forecast => forecast.Summary == summary);
        }

        return Results.Ok(new PagedResult<WeatherForecast>(results.ToArray(), 1, 25, forecasts.Count, null));
    })
    .WithName("ListWeather")
    .WithTags("Weather")
    .WithSummary("List weather forecasts")
    .Produces<PagedResult<WeatherForecast>>();

app.MapGet("/weather/{id:int}", (int id) =>
    {
        var forecast = forecasts.FirstOrDefault(item => item.Id == id);
        return forecast is null
            ? Results.NotFound(new ProblemDetails { Title = "Forecast not found", Status = StatusCodes.Status404NotFound })
            : Results.Ok(forecast);
    })
    .WithName("GetWeather")
    .WithTags("Weather")
    .WithSummary("Get a weather forecast by ID")
    .Produces<WeatherForecast>()
    .Produces<ProblemDetails>(StatusCodes.Status404NotFound);

app.MapGet("/shipments", (
        [FromQuery] ShipmentStatus[]? status,
        [FromQuery] string? countryCode,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 25) =>
    {
        var results = shipments.AsEnumerable();

        if (status is { Length: > 0 })
        {
            results = results.Where(shipment => status.Contains(shipment.Status));
        }

        if (!string.IsNullOrWhiteSpace(countryCode))
        {
            results = results.Where(shipment => shipment.Receiver.Address.CountryCode.Equals(countryCode, StringComparison.OrdinalIgnoreCase));
        }

        var items = results.Skip((page - 1) * pageSize).Take(pageSize).ToArray();
        return Results.Ok(new PagedResult<Shipment>(items, page, pageSize, shipments.Count, null));
    })
    .WithName("ListShipments")
    .WithTags("Shipments")
    .WithSummary("List shipments")
    .WithDescription("Supports array query parameters, enum filters, pagination, and nested response schemas.")
    .Produces<PagedResult<Shipment>>();

app.MapGet("/shipments/{id}", (string id, [FromHeader(Name = "If-None-Match")] string? etag) =>
    {
        var shipment = shipments.FirstOrDefault(item => item.Id.Equals(id, StringComparison.OrdinalIgnoreCase));
        return shipment is null
            ? Results.NotFound(new ProblemDetails { Title = "Shipment not found", Status = StatusCodes.Status404NotFound })
            : Results.Ok(shipment);
    })
    .WithName("GetShipment")
    .WithTags("Shipments")
    .WithSummary("Get shipment by ID")
    .Produces<Shipment>()
    .Produces<ProblemDetails>(StatusCodes.Status404NotFound);

app.MapPost("/shipments", ([FromBody] CreateShipmentRequest request) =>
    {
        var shipment = new Shipment(
            $"shp_{1001 + shipments.Count}",
            ShipmentStatus.Pending,
            request.Sender,
            request.Receiver,
            request.Parcel,
            request.DeclaredValue,
            request.DeliverBy,
            request.Metadata ?? new Dictionary<string, string>(),
            Array.Empty<TrackingEvent>());

        shipments.Add(shipment);
        return Results.Created($"/shipments/{shipment.Id}", shipment);
    })
    .WithName("CreateShipment")
    .WithTags("Shipments")
    .WithSummary("Create shipment")
    .Accepts<CreateShipmentRequest>("application/json")
    .Produces<Shipment>(StatusCodes.Status201Created)
    .Produces<ValidationProblemDetails>(StatusCodes.Status400BadRequest);

app.MapPatch("/shipments/{id}/status", (string id, [FromBody] UpdateShipmentStatusRequest request) =>
    {
        var index = shipments.FindIndex(item => item.Id.Equals(id, StringComparison.OrdinalIgnoreCase));
        if (index < 0)
        {
            return Results.NotFound(new ProblemDetails { Title = "Shipment not found", Status = StatusCodes.Status404NotFound });
        }

        var current = shipments[index];
        var updated = current with
        {
            Status = request.Status,
            Events = current.Events
                .Append(new TrackingEvent(request.Status.ToString(), DateTimeOffset.UtcNow, request.Location, request.Note))
                .ToArray()
        };
        shipments[index] = updated;
        return Results.Ok(updated);
    })
    .WithName("UpdateShipmentStatus")
    .WithTags("Shipments")
    .WithSummary("Update shipment status")
    .Accepts<UpdateShipmentStatusRequest>("application/json")
    .Produces<Shipment>()
    .Produces<ProblemDetails>(StatusCodes.Status404NotFound);

app.MapPost("/shipments/{id}/documents", (
        string id,
        IFormFile file,
        [FromForm] DocumentKind kind,
        [FromForm] string? description) =>
    {
        var receipt = new UploadReceipt(Guid.NewGuid(), id, kind, file.FileName, file.Length, "queued");
        return Results.Accepted($"/shipments/{id}/documents/{receipt.UploadId}", receipt);
    })
    .WithName("UploadShipmentDocument")
    .WithTags("Documents")
    .WithSummary("Upload shipment document")
    .Accepts<IFormFile>("multipart/form-data")
    .Produces<UploadReceipt>(StatusCodes.Status202Accepted)
    .DisableAntiforgery();

app.Run();

public sealed record Address(
    [property: Required] string Line1,
    string? Line2,
    [property: Required] string City,
    [property: Required] string Region,
    [property: Required] string PostalCode,
    [property: StringLength(2, MinimumLength = 2)] string CountryCode);

public sealed record AuthenticatedIdentity(bool Authenticated, string Scheme);

public sealed class ApiKeyOperationFilter : Swashbuckle.AspNetCore.SwaggerGen.IOperationFilter
{
    public void Apply(OpenApiOperation operation, Swashbuckle.AspNetCore.SwaggerGen.OperationFilterContext context)
    {
        operation.Security = operation.OperationId switch
        {
            "GetApiKeyIdentity" => [Requirement("ApiKey")],
            "GetBearerIdentity" => [Requirement("Bearer")],
            "GetBasicIdentity" => [Requirement("Basic")],
            "GetQueryApiKeyIdentity" => [Requirement("QueryApiKey")],
            "GetCookieApiKeyIdentity" => [Requirement("CookieApiKey")],
            "GetAlternativeIdentity" => [Requirement("ApiKey"), Requirement("Bearer")],
            "GetCombinedIdentity" => [Requirement("ApiKey", "Basic")],
            "GetOptionalIdentity" => [new OpenApiSecurityRequirement(), Requirement("Bearer")],
            _ => null
        };
    }

    private static OpenApiSecurityRequirement Requirement(params string[] schemeIds)
    {
        var requirement = new OpenApiSecurityRequirement();
        foreach (var schemeId in schemeIds)
        {
            requirement[new OpenApiSecurityScheme { Reference = new OpenApiReference { Type = ReferenceType.SecurityScheme, Id = schemeId } }] = Array.Empty<string>();
        }
        return requirement;
    }
}

public sealed record CreateShipmentRequest(
    [property: Required] Party Sender,
    [property: Required] Party Receiver,
    [property: Required] Parcel Parcel,
    [property: Required] Money DeclaredValue,
    DateOnly? DeliverBy,
    Dictionary<string, string>? Metadata);

public sealed record DependencyHealth(string Status, int LatencyMs);

public sealed record Dimensions(
    [property: Range(0.01, 1000)] decimal Length,
    [property: Range(0.01, 1000)] decimal Width,
    [property: Range(0.01, 1000)] decimal Height,
    [property: Required] string Unit);

public sealed record HealthResponse(
    string Status,
    string Service,
    double UptimeSeconds,
    Dictionary<string, DependencyHealth> Dependencies);

public sealed record Money(
    [property: Range(0.01, 100000)] decimal Amount,
    [property: StringLength(3, MinimumLength = 3)] string Currency);

public sealed record Parcel(
    [property: Range(0.01, 500)] decimal Weight,
    [property: Required] string WeightUnit,
    [property: Required] Dimensions Dimensions,
    string[] Tags);

public sealed record Party(
    [property: Required] string Id,
    [property: Required] string Name,
    [property: Required] Address Address);

public sealed record PagedResult<T>(
    IReadOnlyList<T> Items,
    int Page,
    int PageSize,
    int Total,
    string? NextCursor);

public sealed record Shipment(
    string Id,
    ShipmentStatus Status,
    Party Sender,
    Party Receiver,
    Parcel Parcel,
    Money DeclaredValue,
    DateOnly? DeliverBy,
    Dictionary<string, string> Metadata,
    IReadOnlyList<TrackingEvent> Events);

public enum ShipmentStatus
{
    Pending,
    InTransit,
    CustomsHold,
    Delivered,
    Cancelled
}

public enum DocumentKind
{
    Label,
    Invoice,
    CustomsDeclaration,
    ProofOfDelivery
}

public sealed record TrackingEvent(
    string Type,
    DateTimeOffset OccurredAt,
    string? Location,
    string? Note);

public sealed record UpdateShipmentStatusRequest(
    ShipmentStatus Status,
    string? Location,
    [property: StringLength(500)] string? Note);

public sealed record UploadReceipt(
    Guid UploadId,
    string ShipmentId,
    DocumentKind Kind,
    string FileName,
    long SizeBytes,
    string Status);

public sealed record WeatherForecast(
    int Id,
    string City,
    int TemperatureC,
    WeatherSummary Summary,
    DateOnly ForecastDate,
    WeatherStation Station);

public enum WeatherSummary
{
    Sunny,
    Cloudy,
    Breezy,
    Rain,
    Snow
}

public sealed record WeatherStation(
    string StationId,
    string CountryCode,
    double Latitude,
    double Longitude);
