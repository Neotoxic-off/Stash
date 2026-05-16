using Microsoft.EntityFrameworkCore;
using Storage.Api.Models;

namespace Storage.Api.Data;

public class StorageDbContext : DbContext
{
    public StorageDbContext(DbContextOptions<StorageDbContext> options) : base(options) { }

    public DbSet<Bucket> Buckets => Set<Bucket>();
    public DbSet<StorageObject> Objects => Set<StorageObject>();
    public DbSet<AccessKey> AccessKeys => Set<AccessKey>();
    public DbSet<MultipartUpload> MultipartUploads => Set<MultipartUpload>();
    public DbSet<MultipartPart> MultipartParts => Set<MultipartPart>();
    public DbSet<PresignedToken> PresignedTokens => Set<PresignedToken>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        builder.Entity<Bucket>().HasKey(b => b.Name);

        builder.Entity<StorageObject>().HasKey(o => o.Id);
        builder.Entity<StorageObject>()
            .HasIndex(o => new { o.BucketName, o.Key })
            .IsUnique();

        builder.Entity<AccessKey>().HasKey(k => k.Id);

        builder.Entity<MultipartUpload>().HasKey(u => u.UploadId);

        builder.Entity<MultipartPart>().HasKey(p => p.Id);
        builder.Entity<MultipartPart>().Property(p => p.Id).ValueGeneratedOnAdd();

        builder.Entity<PresignedToken>().HasKey(t => t.Id);
    }
}
