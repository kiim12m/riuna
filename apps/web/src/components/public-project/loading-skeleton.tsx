import { Skeleton } from "@/components/ui/skeleton";

export function LoadingSkeleton() {
  return (
    <div className="min-h-screen bg-background flex flex-col w-full">
      <div className="flex-1 flex items-center justify-center">
        <div className="container mx-auto px-4 py-8">
          <div className="space-y-8 max-w-6xl mx-auto">
            <div className="text-center space-y-4">
              <Skeleton className="h-8 rounded-md w-64 mx-auto" />
              <Skeleton className="h-4 rounded-md w-96 mx-auto" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              {["skeleton-1", "skeleton-2", "skeleton-3", "skeleton-4"].map(
                (skeletonId) => (
                  <div key={skeletonId} className="space-y-3">
                    <Skeleton className="h-6 rounded-md" />
                    <div className="space-y-2">
                      {["task-1", "task-2", "task-3"].map((taskId) => (
                        <Skeleton
                          key={`${skeletonId}-${taskId}`}
                          className="h-24 rounded-lg"
                        />
                      ))}
                    </div>
                  </div>
                ),
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
