import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { nanoid } from 'nanoid'
import type { Media } from '@prisma/client'
import { prisma } from '@/lib/db/prisma'

const MAX_SIZE_BYTES = 10 * 1024 * 1024 // 10 MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

function getS3Client(): S3Client {
  return new S3Client({
    endpoint: process.env.B2_ENDPOINT,
    region: 'auto',
    credentials: {
      accessKeyId: process.env.B2_APPLICATION_KEY_ID ?? '',
      secretAccessKey: process.env.B2_APPLICATION_KEY ?? '',
    },
  })
}

export type UploadResult = {
  key: string
  url: string
  mimeType: string
  sizeBytes: number
}

export type UploadValidationError = {
  valid: false
  reason: string
}

export function validateUpload(
  mimeType: string,
  sizeBytes: number
): UploadValidationError | { valid: true } {
  if (!ALLOWED_TYPES.includes(mimeType)) {
    return {
      valid: false,
      reason: `File type "${mimeType}" is not allowed. Accepted: JPEG, PNG, WebP, GIF.`,
    }
  }
  if (sizeBytes > MAX_SIZE_BYTES) {
    return {
      valid: false,
      reason: `File size ${(sizeBytes / 1024 / 1024).toFixed(1)} MB exceeds the 10 MB limit.`,
    }
  }
  return { valid: true }
}

export async function uploadToB2(
  buffer: Buffer,
  mimeType: string,
  originalFilename?: string
): Promise<UploadResult> {
  const bucket = process.env.B2_BUCKET_NAME ?? ''
  const ext = mimeType.split('/')[1] ?? 'bin'
  const key = `media/${nanoid()}${originalFilename ? `-${sanitizeFilename(originalFilename)}` : ''}.${ext}`

  const client = getS3Client()
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
      // Bucket is private; access is via the Cloudflare Worker
      ACL: 'private',
    })
  )

  const workerUrl = process.env.CLOUDFLARE_WORKER_URL?.replace(/\/$/, '') ?? ''
  const url = `${workerUrl}/${key}`

  return { key, url, mimeType, sizeBytes: buffer.length }
}

export async function deleteFromB2(key: string): Promise<void> {
  const client = getS3Client()
  await client.send(
    new DeleteObjectCommand({
      Bucket: process.env.B2_BUCKET_NAME ?? '',
      Key: key,
    })
  )
}

// Presigned upload URL for direct browser → B2 uploads (alternative flow)
export async function createPresignedUploadUrl(
  key: string,
  mimeType: string,
  expiresInSeconds = 300
): Promise<string> {
  const client = getS3Client()
  const command = new PutObjectCommand({
    Bucket: process.env.B2_BUCKET_NAME ?? '',
    Key: key,
    ContentType: mimeType,
  })
  return getSignedUrl(client, command, { expiresIn: expiresInSeconds })
}

export async function saveMediaRecord(data: {
  key: string
  mimeType: string
  sizeBytes: number
  uploadedById: string
  altText?: string
  isDecorative?: boolean
}): Promise<Media> {
  const workerUrl = process.env.CLOUDFLARE_WORKER_URL?.replace(/\/$/, '') ?? ''
  return prisma.media.create({
    data: {
      key: data.key,
      provider: 'backblaze',
      url: `${workerUrl}/${data.key}`,
      mimeType: data.mimeType,
      sizeBytes: data.sizeBytes,
      uploadedById: data.uploadedById,
      altText: data.altText ?? null,
      isDecorative: data.isDecorative ?? false,
    },
  })
}

export async function getMediaReferences(mediaId: string): Promise<string[]> {
  const config = await prisma.siteConfig.findUnique({
    where: { id: 'singleton' },
    select: { logoMediaId: true, faviconMediaId: true },
  })
  const refs: string[] = []
  if (config?.logoMediaId === mediaId) refs.push('site logo')
  if (config?.faviconMediaId === mediaId) refs.push('site favicon')
  const infoPages = await prisma.infoPage.count({ where: { ogImageId: mediaId } })
  if (infoPages > 0) refs.push(`${infoPages} info page${infoPages > 1 ? 's' : ''}`)
  return refs
}

function sanitizeFilename(name: string): string {
  return name
    .replace(/[^a-z0-9._-]/gi, '-')
    .replace(/-+/g, '-')
    .slice(0, 40)
    .toLowerCase()
}
