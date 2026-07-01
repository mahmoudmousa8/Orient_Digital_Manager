import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Search, Download, FileSpreadsheet, ExternalLink, ClipboardCheck, Loader2 } from "lucide-react";
import { STATUS_AR } from "@/lib/format";
import * as XLSX from "xlsx";
import {
  listPublishingTasks,
  updatePublishingTask,
  importExcelPublishingData,
} from "@/lib/publishing.functions";

export const Route = createFileRoute("/_authenticated/publishing")({
  component: PublishingPage,
});

function PublishingPage() {
  const { user, isAdmin, isStaff } = useAuth();
  const qc = useQueryClient();

  const listFn = useServerFn(listPublishingTasks);
  const updateFn = useServerFn(updatePublishingTask);
  const importFn = useServerFn(importExcelPublishingData);

  const [search, setSearch] = useState("");
  const [filterAssignee, setFilterAssignee] = useState("all"); // all, me, unassigned
  const [filterStatus, setFilterStatus] = useState("all");

  // Fetching data
  const { data, isLoading } = useQuery({
    queryKey: ["publishing-tasks"],
    queryFn: () => listFn(),
    enabled: isStaff,
  });

  const tasks = data?.tasks ?? [];
  const staff = data?.staff ?? [];

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: (variables: {
      channelId: string;
      assignedTo?: string | null;
      month7?: boolean;
      month8?: boolean;
      month9?: boolean;
      month10?: boolean;
      month11?: boolean;
      month12?: boolean;
      notes?: string;
    }) => updateFn({ data: variables }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["publishing-tasks"] });
    },
    onError: (err: any) => {
      toast.error(err.message || "حدث خطأ أثناء التحديث");
    },
  });

  // Excel Import mutation
  const importMutation = useMutation({
    mutationFn: () => importFn(),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ["publishing-tasks"] });
      toast.success(`تم استيراد وتحديث ${res.importedCount} قناة بنجاح من ملف الإكسيل!`);
    },
    onError: (err: any) => {
      toast.error(err.message || "حدث خطأ أثناء الاستيراد من ملف الإكسيل");
    },
  });

  // Filter tasks logic
  const filteredTasks = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tasks.filter((t) => {
      // 1. Search filter
      if (
        q &&
        !t.channelName.toLowerCase().includes(q) &&
        !t.clientName.toLowerCase().includes(q) &&
        !(staff.find((s) => s.id === t.assignedTo)?.fullName ?? "").toLowerCase().includes(q)
      ) {
        return false;
      }

      // 2. Assignee filter
      if (filterAssignee === "me" && t.assignedTo !== user?.id) return false;
      if (filterAssignee === "unassigned" && t.assignedTo !== null) return false;

      // 3. Status filter
      if (filterStatus !== "all" && t.status !== filterStatus) return false;

      return true;
    });
  }, [tasks, search, filterAssignee, filterStatus, user?.id, staff]);

  // Export current list to Excel
  function handleExport() {
    const STATUS_AR_LOCAL: Record<string, string> = {
      active: "نشطة",
      paused: "متوقفة مؤقتاً",
      suspended: "موقوفة مؤقتاً",
      closed: "مغلقة",
    };

    const exportData = filteredTasks.map((t) => {
      const staffName = staff.find((s) => s.id === t.assignedTo)?.fullName ?? "غير معين";
      const totalChecked = [t.month7, t.month8, t.month9, t.month10, t.month11, t.month12].filter(Boolean).length;
      const progress = `${Math.round((totalChecked / 6) * 100)}%`;

      return {
        "اسم القناة": t.channelName,
        "الموظف المسؤول": staffName,
        "العميل": t.clientName,
        "الحالة": STATUS_AR_LOCAL[t.status] || t.status,
        "حالة الأرباح": t.isMonetized !== false ? "مفعلة" : "غير مفعلة",
        "يوليو": t.month7 ? "تم" : "—",
        "أغسطس": t.month8 ? "تم" : "—",
        "سبتمبر": t.month9 ? "تم" : "—",
        "أكتوبر": t.month10 ? "تم" : "—",
        "نوفمبر": t.month11 ? "تم" : "—",
        "ديسمبر": t.month12 ? "تم" : "—",
        "ملاحظات": t.notes || "",
        "التقدم": progress,
        "الرابط": t.link || "",
      };
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "نشر القنوات");
    XLSX.writeFile(wb, "orient-publishing-tracker.xlsx");
    toast.success("تم تصدير ملف Excel بنجاح");
  }

  if (!isStaff) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-muted-foreground">صلاحيات غير كافية للوصول لهذه الصفحة.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Header section */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-black flex items-center gap-2.5 text-white">
            <ClipboardCheck className="w-8 h-8 text-primary" />
            نشر القنوات (YouTube Channel Tracker)
          </h1>
          <p className="text-sm text-muted-foreground mt-1.5">
            تتبع مهام النشر الشهرية للقنوات وإسنادها للموظفين
          </p>
        </div>

        <div className="flex gap-2">
          {isAdmin && (
            <Button
              variant="outline"
              onClick={() => importMutation.mutate()}
              disabled={importMutation.isPending}
              className="border-primary/20 hover:bg-primary/10 text-white flex items-center gap-1.5"
            >
              {importMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin ml-1" />
              ) : (
                <FileSpreadsheet className="w-4 h-4 ml-1" />
              )}
              استيراد من Excel
            </Button>
          )}

          <Button
            variant="outline"
            onClick={handleExport}
            className="border-primary/20 hover:bg-primary/10 text-white flex items-center gap-1.5"
          >
            <Download className="w-4 h-4 ml-1" /> تصدير Excel
          </Button>
        </div>
      </div>

      {/* Filters section */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="بحث باسم القناة أو الموظف أو العميل…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="search-input-padding"
          />
        </div>

        <Select value={filterAssignee} onValueChange={setFilterAssignee}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="الموظف المسؤول" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الموظفين</SelectItem>
            <SelectItem value="me">قنواتي فقط</SelectItem>
            <SelectItem value="unassigned">غير معينة لموظف</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="حالة القناة" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الحالات</SelectItem>
            {["active", "paused", "suspended", "closed"].map((s) => (
              <SelectItem key={s} value={s}>
                {STATUS_AR[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table grid */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right min-w-[150px]">القناة</TableHead>
                  <TableHead className="text-right">الموظف المسؤول</TableHead>
                  <TableHead className="text-right">العميل</TableHead>
                  <TableHead className="text-center">يوليو (7)</TableHead>
                  <TableHead className="text-center">أغسطس (8)</TableHead>
                  <TableHead className="text-center">سبتمبر (9)</TableHead>
                  <TableHead className="text-center">أكتوبر (10)</TableHead>
                  <TableHead className="text-center">نوفمبر (11)</TableHead>
                  <TableHead className="text-center">ديسمبر (12)</TableHead>
                  <TableHead className="text-right min-w-[200px]">ملاحظات</TableHead>
                  <TableHead className="text-center min-w-[120px]">التقدم</TableHead>
                  <TableHead className="text-right">الرابط</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow>
                    <TableCell colSpan={12} className="text-center py-8">
                      <div className="flex items-center justify-center gap-2">
                        <Loader2 className="w-5 h-5 animate-spin text-primary" />
                        <span>جاري تحميل قنوات التتبع…</span>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
                {!isLoading && filteredTasks.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={12} className="text-center text-muted-foreground py-8">
                      لا توجد نتائج مطابقة للفلاتر الحالية.
                    </TableCell>
                  </TableRow>
                )}
                {!isLoading &&
                  filteredTasks.map((t) => {
                    const isAssignedToMe = t.assignedTo === user?.id;
                    const canEdit = isAdmin || isAssignedToMe;

                    // Calculate progress
                    const totalMonths = 6;
                    const checkedCount = [
                      t.month7,
                      t.month8,
                      t.month9,
                      t.month10,
                      t.month11,
                      t.month12,
                    ].filter(Boolean).length;
                    const percent = Math.round((checkedCount / totalMonths) * 100);

                    return (
                      <TableRow key={t.channelId} className={isAssignedToMe ? "bg-primary/5" : ""}>
                        {/* Channel Name */}
                        <TableCell className="font-bold text-right text-white">
                          {t.channelName}
                        </TableCell>

                        {/* Assigned Staff */}
                        <TableCell className="text-right">
                          {isAdmin ? (
                            <Select
                              value={t.assignedTo || "none"}
                              onValueChange={(val) =>
                                updateMutation.mutate({
                                  channelId: t.channelId,
                                  assignedTo: val === "none" ? null : val,
                                })
                              }
                            >
                              <SelectTrigger className="w-44 h-8 bg-slate-900 border-slate-700 text-xs">
                                <SelectValue placeholder="اختر موظف" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">غير معين</SelectItem>
                                {staff.map((s) => (
                                  <SelectItem key={s.id} value={s.id} className="text-xs">
                                    {s.fullName || s.email}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className="text-xs text-slate-300">
                              {staff.find((s) => s.id === t.assignedTo)?.fullName ?? "غير معين"}
                            </span>
                          )}
                        </TableCell>

                        {/* Client Name */}
                        <TableCell className="text-right text-xs text-slate-300">
                          {t.clientName}
                        </TableCell>

                        {/* Month Checkboxes */}
                        <TableCell className="text-center">
                          <Checkbox
                            checked={t.month7}
                            disabled={!canEdit}
                            onCheckedChange={(checked) =>
                              updateMutation.mutate({
                                channelId: t.channelId,
                                month7: !!checked,
                              })
                            }
                          />
                        </TableCell>
                        <TableCell className="text-center">
                          <Checkbox
                            checked={t.month8}
                            disabled={!canEdit}
                            onCheckedChange={(checked) =>
                              updateMutation.mutate({
                                channelId: t.channelId,
                                month8: !!checked,
                              })
                            }
                          />
                        </TableCell>
                        <TableCell className="text-center">
                          <Checkbox
                            checked={t.month9}
                            disabled={!canEdit}
                            onCheckedChange={(checked) =>
                              updateMutation.mutate({
                                channelId: t.channelId,
                                month9: !!checked,
                              })
                            }
                          />
                        </TableCell>
                        <TableCell className="text-center">
                          <Checkbox
                            checked={t.month10}
                            disabled={!canEdit}
                            onCheckedChange={(checked) =>
                              updateMutation.mutate({
                                channelId: t.channelId,
                                month10: !!checked,
                              })
                            }
                          />
                        </TableCell>
                        <TableCell className="text-center">
                          <Checkbox
                            checked={t.month11}
                            disabled={!canEdit}
                            onCheckedChange={(checked) =>
                              updateMutation.mutate({
                                channelId: t.channelId,
                                month11: !!checked,
                              })
                            }
                          />
                        </TableCell>
                        <TableCell className="text-center">
                          <Checkbox
                            checked={t.month12}
                            disabled={!canEdit}
                            onCheckedChange={(checked) =>
                              updateMutation.mutate({
                                channelId: t.channelId,
                                month12: !!checked,
                              })
                            }
                          />
                        </TableCell>

                        {/* Notes */}
                        <TableCell className="text-right">
                          <Input
                            defaultValue={t.notes}
                            disabled={!canEdit}
                            onBlur={(e) => {
                              if (e.target.value !== t.notes) {
                                updateMutation.mutate({
                                  channelId: t.channelId,
                                  notes: e.target.value,
                                });
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.currentTarget.blur();
                              }
                            }}
                            placeholder="ملاحظات..."
                            className="h-8 bg-slate-900 border-slate-700 text-xs w-full text-slate-100"
                          />
                        </TableCell>

                        {/* Progress */}
                        <TableCell className="text-center">
                          <div className="flex flex-col items-center gap-1">
                            <span className="text-xs font-bold text-white">{percent}%</span>
                            <Progress value={percent} className="w-16 h-1.5" />
                          </div>
                        </TableCell>

                        {/* External Link */}
                        <TableCell className="text-right">
                          {t.link ? (
                            <a
                              href={t.link}
                              target="_blank"
                              rel="noreferrer"
                              className="text-slate-300 hover:text-white inline-flex items-center gap-1 text-xs"
                            >
                              <ExternalLink className="w-3 h-3" />
                              فتح
                            </a>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
