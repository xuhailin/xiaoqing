# 创建 图生视频 任务
curl -X POST https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ARK_API_KEY" \
  -d '{
    "model": "doubao-seedance-1-0-pro-250528",
    "content": [
        {
            "type": "text",
            "text": "无人机以极快速度穿越复杂障碍或自然奇观，带来沉浸式飞行体验  --resolution 1080p  --duration 5 --camerafixed false --watermark true"
        },
        {
            "type": "image_url",
            "image_url": {
                "url": "https://ark-project.tos-cn-beijing.volces.com/doc_image/seepro_i2v.png"
            }
        }
    ]
}'


# 查询任务（需将id替换成第1步返回的任务id)
curl -X GET https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks/{id} \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ARK_API_KEY"